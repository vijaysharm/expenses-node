angular.module('ExpenseApp', ['ngRoute', 'ngResource', 'ngMessages', 'ngQuickDate'])
	.config(function ($routeProvider) {
		var authorize = {
			auth: function ($q, authenticationService) {
				var token = authenticationService.token();
	        	if (token) {
	            	return $q.when(token);
	        	} else {
	            	return $q.reject({ authenticated: false });
	        	}
			}
		};

	    $routeProvider
	    	.when('/', {
				templateUrl: 'templates/listexpenses.html',
	        	controller: 'ListController',
	        	resolve: authorize
	    	})
	    	.when('/add', {
				templateUrl: 'templates/addexpense.html',
	        	controller: 'AddController',
	        	resolve: authorize
	    	})
	    	.when('/week', {
				templateUrl: 'templates/weeklyexpense.html',
				controller: 'WeekController',
				resolve: authorize
	    	})
	    	.when('/edit/:id', {
				templateUrl: 'templates/editexpense.html',
	        	controller: 'EditController',
	        	resolve: authorize
	    	})
	    	.when('/signup', {
				templateUrl: 'templates/newuser.html',
	        	controller: 'NewUserController'
	    	})
	    	.when('/login', {
	        	templateUrl: 'templates/login.html',
	        	controller: 'LoginController'
	    	})
	    	.otherwise({
				redirectTo: '/'
        	});
	})
	.factory('authenticationService', function ($http, $q, $window) {
		return {
			create: function (username, password) {
				var deferred = $q.defer();
				$http.post('/user', { username: username, password: password })
		            .then(function (result) {
		                deferred.resolve(result);
		            }, function (error) {
		            	delete $window.localStorage.token;
		                deferred.reject(error);
		            });

		        return deferred.promise;
			},
			login: function (username, password) {
				var deferred = $q.defer();
				delete $window.localStorage.token;
				$http.post('/login', { username: username, password: password })
		            .then(function (result) {
		                $window.localStorage.token = result.data.token;
		                deferred.resolve(result);
		            }, function (error) {
		            	delete $window.localStorage.token;
		                deferred.reject(error);
		            });

		        return deferred.promise;
			},
			logout: function (callback) {
				if ($window.localStorage.token) {
					$http.get('/logout?token='+$window.localStorage.token)
						.then(function () {
							delete $window.localStorage.token;
							callback();
						});
				} else {
					callback();
				}
			},
			token: function () {
				return $window.localStorage.token;
			}
		};
	})
	.factory('expenseService', function ($resource) {
		return $resource('/expenses/:id', { id: '@id' }, {
            'update': { method: 'PUT' }
        });
	})
	.controller('NewUserController', function ($scope, $location, authenticationService, ErrorCodes) {
		// TODO: If logged in, then just forward to /

		$scope.state = 'ok';
		$scope.user = { username: '', password: '' };
		$scope.signup = function () {
			if ( $scope.loginForm.$invalid ) {
				$scope.$broadcast('record:invalid');
			} else {
				authenticationService.create($scope.user.username, $scope.user.password)
					.then(function (info) {
						// TODO: Show that account creation succeded, login
						$location.url('/login');
					}, function (error) {
						$scope.state = 'save-error';
						$scope.errorMessage = ErrorCodes[error.data.error];
					});
			}
		};
	})
	.controller('LoginController', function ($scope, $location, authenticationService, ErrorCodes) {
		// TODO: If logged in, then just forward to /

		$scope.state = 'ok';
		$scope.user = { username: '', password: '' };
		$scope.signup = function () {
			$location.url('/signup');
		};
		$scope.login = function () {
			if ( $scope.loginForm.$invalid ) {
				$scope.$broadcast('record:invalid');
			} else {
				authenticationService.login($scope.user.username, $scope.user.password)
					.then(function (info) {
						$location.url('/');
					}, function (error) {
						$scope.state = 'save-error';
						$scope.errorMessage = ErrorCodes[error.data.error];
					});
			}
		};
	})
	.controller('WeekController', function ($scope, $location, expenseService, authenticationService, ErrorCodes) {
		$scope.state = 'loading';
		$scope.expenses = [];

		var groupBy = function (expenses) {
			var group = {};
			expenses.forEach(function (expense, index) {
				var date = moment(expense.date).utc();
				var year = date.year();
				var week = date.week();
				var id = year + '.' + week;

				var summary = group[id] || {};
				summary.expense = summary.expense || [];
				summary.total = expense.amount + (summary.total || 0);
				summary.items = 1 + (summary.items || 0);
				summary.start = moment([year]).week(week).day('Sunday').toDate();
				summary.end = moment([year]).week(week).day('Saturday').toDate();
				summary.expense.push(expense);

				group[id] = summary;
			});

			return _.values(group);
		};

		expenseService.query({token: authenticationService.token()}).$promise
			.then(function (expenses) {
				$scope.expenses = groupBy(expenses);
				$scope.state = 'ok';
			}, function (error) {
				if ( error.status == 401 ) {
					authenticationService.logout(function () {
						$location.url('/login');
					});
				} else {
					$scope.state = 'error';
					$scope.loadErrorMessage = ErrorCodes[error.data.error];
				}
			});

		$scope.logout = function () {
			authenticationService.logout(function () {
				$location.url('/login');
			});
		};
	})
	.controller('ListController', function ($scope, $location, expenseService, authenticationService, ErrorCodes) {
		$scope.state = 'loading';
		$scope.predicate = 'date';
		$scope.reverse = true;
		$scope.expenses = [];
		expenseService.query({token: authenticationService.token()}).$promise
			.then(function (expenses) {
				$scope.expenses = expenses;
				$scope.state = 'ok';
			}, function (error) {
				if ( error.status == 401 ) {
					authenticationService.logout(function () {
						$location.url('/login');
					});
				} else {
					$scope.state = 'error';
					$scope.loadErrorMessage = ErrorCodes[error.data.error];
				}
			});
		$scope.edit = function (expense) {
			$location.url('/edit/' + expense._id);
		};

		$scope.logout = function () {
			authenticationService.logout(function () {
				$location.url('/login');
			});
		};
	})
	.controller('AddController', function ($scope, $location, expenseService, authenticationService, ErrorCodes) {
		$scope.state = 'ok';
		$scope.expense = new expenseService({
			description: '',
			comment: '',
			date: new Date(),
			amount: ''
		});

		$scope.save = function () {
			if ( $scope.expenseForm.$invalid ) {
				$scope.$broadcast('record:invalid');
			} else {
				$scope.state = 'loading';
				$scope.expense.$save({token: authenticationService.token()}).then(function (added) {
					$location.url('/');
				}, function (error) {
					if ( error.status == 401 ) {
						authenticationService.logout(function () {
							$location.url('/login');
						});
					} else {
						$scope.state = 'error';
						$scope.errorMessage = ErrorCodes[error.data.error];
					}
				});
			}
		};

		$scope.cancel = function () {
			$location.url('/');
		};

		$scope.logout = function () {
			authenticationService.logout(function () {
				$location.url('/login');
			});
		};
	})
	.controller('EditController', function ($scope, $location, $routeParams, expenseService, authenticationService, ErrorCodes) {
		$scope.state = 'loading';
		expenseService.get({ id: $routeParams.id, token: authenticationService.token() })
			.$promise.then(function (expense) {
				$scope.expense = expense;
				$scope.state = 'ok';
			}, function (error) {
				$scope.state = 'error';
				$scope.loadErrorMessage = ErrorCodes[error.data.error];
			});

		$scope.save = function () {
			if ( $scope.expenseForm.$invalid ) {
				$scope.$broadcast('record:invalid');
			} else {
				$scope.expense.$update({ id: $routeParams.id, token: authenticationService.token() })
					.then(function (updated) {
						$location.url('/');
					}, function (error) {
						if ( error.status == 401 ) {
							authenticationService.logout(function () {
								$location.url('/login');
							});
						}
						else {
							$scope.state = 'save-error';
							$scope.errorMessage = ErrorCodes[error.data.error];
						}
					});
			}
		};

		$scope.cancel = function () {
			$location.url('/');
		};

		$scope.delete = function () {
			$scope.expense.$delete({ id: $routeParams.id, token: authenticationService.token() })
				.then(function (deleted) {
					$location.url('/');
				}, function (error) {
					if ( error.status == 401 ) {
						authenticationService.logout(function () {
							$location.url('/login');
						});
					}
					else {
						$location.url('/');
					}
				});
		};

		$scope.logout = function () {
			authenticationService.logout(function () {
				$location.url('/login');
			});
		};
	})
	.value('ErrorCodes', {
		'expense.insert.failure': 'Failed to create expense',
		'expense.fetch.failure': 'Failed to fetch expense',
		'expense.search.failure': 'Failed to find expense',
		'expense.update.failure': 'Failed to update expense',
		'expense.delete.failure': 'Failed to delete expense',
		'expense.description.empty': 'Description cannot be empty',
		'expense.comment.empty': 'Comment cannot be empty',
		'expense.date.invalid': 'Invalid date provided',
		'expense.date.empty': 'Date cannot be empty',
		'expense.amount.invalid': 'Invalid amout given',
		'expense.invalid.id': 'Invalid expense ID given',
		'expense.not.found': 'Expense not found',
		'session.update.failure': 'Failed to update session',
		'session.search.failure': 'Failed to find session',
		'credentials.empty.error': 'Username or password cannot be empty',
		'credentials.invalid.error': 'Invalid username or password',
		'user.insert.failure': 'Failed to create user',
		'user.search.failure': 'Failed to find user',
		'username.already.exists': 'Username already exists',
		'invalid.token.error': 'Invalid session token used'
	})
	.value('FieldTypes', {
        text: ['Text', 'should be text'],
        textarea: ['Textarea', 'should be text'],
        number: ['Number', 'should be a number'],
        datetime: ['Datetime', 'should be a datetime'],
        password: ['Password', 'should be a password']
    })
	.directive('formField', function (FieldTypes) {
		return {
			restrict: 'EA',
            templateUrl: 'templates/form-field.html',
            replace: true,
            scope: {
                record: '=',
                field: '@',
                datatype: '@'
            },
            link: function ($scope, element, attr) {
            	$scope.types = FieldTypes;
                $scope.$on('record:invalid', function () {
                    $scope[$scope.field].$setDirty();
                });
            }
		};
	})
	.filter('labelCase', function () {
        return function (input) {
            input = input.replace(/([A-Z])/g, ' $1');
            return input[0].toUpperCase() + input.slice(1);
        };
    })
	.run(function ($rootScope, $location) {
		$rootScope.$on("$routeChangeError", function (event, current, previous, eventObj) {
		   	if (eventObj.authenticated === false) {
		       	$location.url("/login");
		   	}
		});
	});
