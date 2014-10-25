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
		}
	})
	.factory('expenseService', function ($resource) {
		return $resource('/expenses/:id', { id: '@id' }, {
            'update': { method: 'PUT' }
        });
	})
	.controller('NewUserController', function ($scope, $location, authenticationService) {
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
						$scope.errorMessage = error.data.message;
					});
			}
		};
	})
	.controller('LoginController', function ($scope, $location, authenticationService) {
		// TODO: If logged in, then just forward to /

		$scope.state = 'ok';
		$scope.user = { username: '', password: '' };
		$scope.signup = function () {
			$location.url('/signup')
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
						$scope.errorMessage = error.data.message;
					});
			}
		};
	})
	.controller('WeekController', function ($scope, $location, expenseService, authenticationService) {
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

			console.log(group);
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
				}
				else { $scope.state = 'error'; }
			});

		$scope.logout = function () {
			authenticationService.logout(function () {
				$location.url('/login');
			});
		};			
	})
	.controller('ListController', function ($scope, $location, expenseService, authenticationService) {
		$scope.state = 'loading';
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
				}
				else { $scope.state = 'error'; }
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
	.controller('AddController', function ($scope, $location, expenseService, authenticationService) {
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
					}
					else { 
						$scope.state = 'error';
						$scope.errorMessage = error.data.message;
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
	.controller('EditController', function ($scope, $location, $routeParams, expenseService, authenticationService) {
		$scope.state = 'loading';
		expenseService.get({ id: $routeParams.id, token: authenticationService.token() })
			.$promise.then(function (expense) {
				$scope.expense = expense;
				$scope.state = 'ok';
			}, function (error) {
				$scope.state = 'error';
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
							$scope.errorMessage = error.data.message;
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
	.value('FieldTypes', {
        text: ['Text', 'should be text'],
        text: ['Textarea', 'should be text'],
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
		}
	})
	.run(function ($rootScope, $location) {
		$rootScope.$on("$routeChangeError", function (event, current, previous, eventObj) {
		   	if (eventObj.authenticated === false) {
		       	$location.url("/login");
		   	}
		});
	});
