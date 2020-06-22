/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| Http routes are entry points to your web application. You can create
| routes for different URL's and bind Controller actions to them.
|
| A complete guide on routing is available here.
| http://adonisjs.com/docs/4.1/routing
|
*/

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route');
const CategoryController = use('App/Controllers/Http/CategoryController');
const AccountController = use('App/Controllers/Http/AccountController');
const FundingPlanController = use('App/Controllers/Http/FundingPlanController');
const InstitutionController = use('App/Controllers/Http/InstitutionController');
const ReportController = use('App/Controllers/Http/ReportController');
const UserController = use('App/Controllers/Http/UserController');

Route.on('/').render('index');

Route.group(() => {
    Route.post('/register', 'UserController.register');
    Route.get('/activate', 'UserController.verifyEmail').as('emailVerification');
    Route.post('/login', 'UserController.login');
    Route.on('/email_verified').render('emailVerified');
}).middleware('guest');

Route.group(() => {
    Route.on('/home').render('index');
    Route.get('/logout', 'UserController.logout');

    Route.get('/user', UserController.get);

    Route.get('/groups', CategoryController.get);
    Route.post('/groups', CategoryController.addGroup).validator('AddGroup');
    Route.patch('/groups/:groupId', CategoryController.updateGroup).validator('UpdateGroup');
    Route.delete('/groups/:groupId', CategoryController.deleteGroup).validator('DeleteGroup');

    Route.get('/groups/:groupId/categories', 'CategoryController.get');
    Route.post('/groups/:groupId/categories', CategoryController.addCategory).validator('AddCategory');
    Route.patch('/groups/:groupId/categories/:catId', CategoryController.updateCategory).validator('UpdateCategory');
    Route.delete('/groups/:groupId/categories/:catId', CategoryController.deleteCategory).validator('DeleteCategory');

    Route.post('/category_transfer', CategoryController.transfer).validator('UpdateCategoryTransfer');
    Route.patch('/category_transfer/:tfrId', CategoryController.transfer).validator('UpdateCategoryTransfer');
    Route.delete('/category_transfer/:tfrId', CategoryController.transferDelete);

    Route.get('/category_balances', CategoryController.balances);

    Route.get('/category/:catId/transactions', CategoryController.transactions);
    Route.get('/category/history', CategoryController.history);

    Route.get('/connected_accounts', InstitutionController.all);

    Route.get('/account/:acctId/transactions', AccountController.transactions);
    Route.get('/account/:acctId/balances', AccountController.balances);

    Route.post('/institutions/sync', InstitutionController.syncAll);

    Route.post('/institution', InstitutionController.add);
    Route.get('/institution/:instId/info', InstitutionController.info);
    Route.get('/institution/:instId/accounts', InstitutionController.get);
    Route.post('/institution/:instId/accounts', 'InstitutionController.addAccounts');
    Route.post('/institution/:instId/accounts/:acctId/transactions/sync', InstitutionController.sync);
    Route.get('/institution/:instId/public_token', InstitutionController.publicToken);

    Route.get('/funding_plans', FundingPlanController.getAll);
    Route.get('/funding_plan/:planId', FundingPlanController.getPlan);
    Route.patch('/funding_plan/:planId/item/:itemId', FundingPlanController.updateCategory);

    Route.patch('/transaction/:txId', InstitutionController.updateTx);
    Route.on('/fundingplans').render('fundingplans');

    Route.get('/reports/:report', ReportController.get);
}).middleware('auth');
