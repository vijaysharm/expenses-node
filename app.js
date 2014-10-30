var express = require('express');
var bodyparser = require('body-parser');
var _ = require('underscore');
var moment = require('moment');
var app = express();
var Db = require('mongodb').Db;
var Server = require('mongodb').Server;
var ObjectID = require('mongodb').ObjectID;

// ***** DB CONNECTION ***** //

function wrapdb( db ) {
	return {
		users: function () {
			return db.collection('users');
		},
		sessions: function () {
			return db.collection('sessions');
		},
		expenses: function () {
			return db.collection('expenses');
		},
		close: function() {
			db.close();
		}
	};
}

function dbInstance (callback) {
	var options = {safe: true, strict: true, fsync:false, journal:true};
	var db = new Db('toptal', new Server('127.0.0.1', 27017, {}), options);
	db.open(function (err, db) {
		if( err ) throw err;
		callback(wrapdb(db));
	});
}

// ***** REPOSITORIES ***** //

var ExpenseRepository = function (db) {
	return {
		create: function (user, expense, success, failure) {
			expense.owner = user._id;
			db.expenses().insert(expense, function (err, result) {
				if (err) {failure({error: 'expense.insert.failure'});}
				else {success(result[0]);}
			});
		},
		get: function (user, success, failure) {
			db.expenses().find({owner: user._id}).toArray(function (err, expenses) {
				if (err) {failure({error: 'expense.fetch.failure'});}
				else success(expenses);
			});
		},
		find: function (expense_id, user, success, failure) {
			db.expenses().findOne({_id: new ObjectID(expense_id), owner: user._id}, function (err, expense) {
				if ( err ) { failure({error: 'expense.search.failure'}); }
				else { success(expense); }
			});
		},
		update: function (user, expense, success, failure) {
			var query = {_id: new ObjectID(expense._id), owner: user._id};
			var sort = [['_id','1']];
			var options = {upsert:false, 'new':true};
			var update = expense;
			update.owner = user._id;
			delete update._id;

			db.expenses().findAndModify(query, sort, update, options, function (err, expense) {
				if (err) { failure({error: 'expense.update.failure' }); }
				else { success(expense); }
			});
		},
		delete: function (user, expense_id, callback, error) {
			db.expenses().remove({_id: new ObjectID(expense_id), owner: user._id}, function (err, removed) {
				if ( err ) {error({error: 'expense.delete.failure'});}
				else {callback(removed);}
			});
		}
	};
};

// TODO: Add support for expiring sessions
var SessionRepository = function (db) {
	return {
		get: function (username, success, failure) {
			var query = {username: username};
			var update = {username: username};
			var sort = [['_id','1']];
			var options = {upsert:true, 'new':true};
			db.sessions().findAndModify(query, sort, update, options, function (err, session) {
				if (err) { failure({error: 'session.update.failure' }); }
				else { success(session); }
			});
		},
		findBySessionId: function (sessionid, success, failure) {
			db.sessions().findOne({_id: new ObjectID(sessionid)}, function (err, session) {
				if (err) {
					failure({error: 'session.search.failure' });
				} else {
					success(session);
				}
			});
		},
		removeByUsername: function (username, success, failure) {
			db.sessions().remove({username: username}, function () {
				success();
			});
		},
		removeById: function (sessionid, success, failure) {
			db.sessions().remove({_id: new ObjectID(sessionid)}, function () {
				success();
			});
		}
	};
};

var UserRepository = function (db) {
	return {
		create: function (username, password, success, failure) {
			var user = {
				_id: username,
				password: password
			};
			db.users().insert(user, function (err, result) {
				if( err ) {failure({error: 'user.insert.failure'});}
				else { success(user); }
			});
		},
		find: function (username, success, failure) {
			db.users().findOne({_id: username.toLowerCase()}, function (err, user) {
				if ( err ) {failure({error: 'user.search.failure'});}
				else { success(user); }
			});
		}
	};
};

// ** MIDDLEWARE ** //

function getUserFromRequest(req, res, next) {
	var username = req.body.username;
	var password = req.body.password;
	if (_.isEmpty(username) || _.isEmpty(password)) {
		res.status(400).json({error: 'credentials.empty.error'});
	} else {
		req.userRepository.find(username, function(user) {
			req.user = user;
			next();
		}, function (message) {
			res.status(500).json(message);
		});
	}
}

function getUserFromToken(req, res, next) {
	var token = req.param('token');
	if ( token && ObjectID.isValid(token) ) {
		req.sessionRepository.findBySessionId(token, function (session) {
			if ( session ) {
				req.userRepository.find(session.username, function(user) {
					if ( user ) {
						req.user = user;
						next();
					} else {
						res.status(401).json({error: 'invalid.token.error'});
					}
				}, function (error) {
					res.status(500).json(message);
				});
			} else {
				res.status(401).json({error: 'invalid.token.error'});
			}
		}, function (error) {
			res.status(500).json(error);
		});
	} else {
		res.status(401).json({error: 'invalid.token.error'});
	}
}

function loadRepositories(req, res, next) {
	dbInstance(function(db) {
		req.userRepository = new UserRepository(db);
		req.sessionRepository = new SessionRepository(db);
		req.expenseRepository = new ExpenseRepository(db);

		res.on('finish', function() {
			db.close();
		});
		next();
	});
}

function validateExpense(req, res, next) {
	var amount = parseFloat(req.body.amount);
	if (_.isEmpty(req.body.description)) {
		res.status(400).json({error: 'expense.description.empty'});
	} else if (_.isEmpty(req.body.comment)) {
		res.status(400).json({error: 'expense.comment.empty'});
	} else if (_.isNaN(amount) || !_.isFinite(amount) || !_.isNumber(amount)) {
		res.status(400).json({error: 'expense.amount.invalid'});
	} else if (_.isEmpty(req.body.date)) {
		res.status(400).json({error: 'expense.date.empty'});
	} else if (!moment(req.body.date).utc().isValid()) {
		res.status(400).json({error: 'expense.date.invalid'});
	} else {
		req.expense = {
			date: moment(req.body.date).utc().toDate(),
			description: req.body.description,
			amount: amount,
			comment: req.body.comment
		};

		next();
	}
}

// ***** ENPOINT **** //

app.use(
	bodyparser.json({})
).use(
	express.static('./public')
).get('/', function (req, res) {
	res.sendfile('./public/views/index.html');
}).get('/expenses', loadRepositories, getUserFromToken, function (req, res) {
	req.expenseRepository.get(req.user, function (expenses) {
		res.status(200).json(expenses);
	}, function (err) {
		res.status(500).json(err);
	});
}).get('/expenses/:id', loadRepositories, getUserFromToken, function (req, res) {
	var id = req.params.id;
	if (id && ObjectID.isValid(id)) {
		req.expenseRepository.find(id, req.user, function (expense) {
			if (expense) {
				res.status(200).json(expense);
			} else {
				res.status(404).json({error: 'expense.not.found'});
			}
		}, function (error) {
			res.status(500).json(error);
		});
	} else {
		res.status(400).json({error: 'expense.invalid.id'});
	}
}).post('/expenses', loadRepositories, getUserFromToken, validateExpense, function (req, res) {
	req.expenseRepository.create(req.user, req.expense, function (saved) {
		res.status(200).json(saved);
	}, function (err) {
		res.status(500).json(err);
	});
}).delete('/expenses/:id', loadRepositories, getUserFromToken, function (req, res) {
	if (ObjectID.isValid(req.params.id)) {
		req.expenseRepository.delete(req.user, req.params.id, function (removed) {
			if ( removed ) { res.status(200).end(); }
			else { res.status(400).json({error: 'expense.invalid.id'});}
		}, function (message) {
			res.status(500).json(message);
		});
	} else {
		res.status(400).json({error: 'expense.invalid.id'});
	}
}).put('/expenses/:id', loadRepositories, getUserFromToken, validateExpense, function (req, res) {
	if (ObjectID.isValid(req.params.id)) {
		req.expense._id = req.params.id;
		req.expenseRepository.update(req.user, req.expense, function (expense) {
			if (expense) { res.status(200).json(expense); }
			else { res.status(400).json({error: 'expene.not.found'}); }
		}, function(message) {
			res.status(500).json(message);
		});
	} else {
		res.status(400).json({error: 'expense.invalid.id'});
	}
}).post('/login', loadRepositories, getUserFromRequest, function (req, res) {
	var user = req.user;
	if ( user ) {
		var username = req.body.username;
		var password = req.body.password;
		if ( password == user.password ) {
			req.sessionRepository.get(username, function (session) {
				res.status(200).json({
					username: username,
					token: session._id
				});
			}, function (error) {
				res.status(500).json(error);
			});
		} else {
			// kill existing sessions if a failed login attempt occurs
			req.sessionRepository.removeByUsername(username, function () {
				res.status(400).json({error: 'credentials.invalid.error'});
			});
		}
	} else {
		res.status(400).json({error: 'credentials.invalid.error'});
	}
}).get('/logout', loadRepositories, function (req, res) {
	var username = req.param('username');
	var token = req.param('token');
	if (!_.isEmpty(token) && ObjectID.isValid(token)) {
		req.sessionRepository.removeById(token, function () {});
	} else if ( !_.isEmpty(username)) {
		req.sessionRepository.removeByUsername(username, function () {});
	}
	res.status(200).end();
}).post('/user', loadRepositories, getUserFromRequest, function (req, res) {
	var user = req.user;
	if ( user ) {
		res.status(400).json({error: 'username.already.exists' });
	} else {
		var username = req.body.username;
		var password = req.body.password;
		req.userRepository.create(username, password, function (user) {
			res.status(200).json({ username: user._id });
		}, function(error) {
			res.status(500).json(error);
		});
	}
}).listen(5000);
