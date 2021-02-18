/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| This file is dedicated for defining HTTP routes. A single file is enough
| for majority of projects, however you can define routes in different
| files and just make sure to import them inside this file. For example
|
| Define routes in following two files
| ├── start/routes/cart.ts
| ├── start/routes/customer.ts
|
| and then import them inside `start/routes/index.ts` as follows
|
| import './cart'
| import './customer'
|
*/

import Route from '@ioc:Adonis/Core/Route'

Route.get('/', 'HomeController.index');

Route.post('/wh', 'WebhookController.post');

Route.group(() => {
  Route.post('/register', 'AuthController.register');
  Route.get('/activate', 'AuthController.verifyEmail').as('emailVerification');
  Route.post('/login', 'AuthController.login');
  Route.on('/email_verified').render('emailVerified');
  Route.post('/password/email', 'AuthController.forgotPassword');
  Route.get('/password/reset/:id/:token', 'AuthController.resetPassword');
  Route.post('/password/update', 'AuthController.updatePassword').as('updatePassword');
}); // .middleware('guest');

Route.group(() => {
    Route.post('/logout', 'AuthController.logout');

    Route.get('/user', 'UsersController.get');
    Route.get('/user/link_token', 'UsersController.getLinkToken');

    Route.get('/groups', 'CategoryController.get');
    Route.post('/groups', 'CategoryController.addGroup');
    Route.patch('/groups/:groupId', 'CategoryController.updateGroup');
    Route.delete('/groups/:groupId', 'CategoryController.deleteGroup');

    Route.get('/groups/:groupId/categories', 'CategoryController.get');
    Route.post('/groups/:groupId/categories', 'CategoryController.addCategory');
    Route.patch('/groups/:groupId/categories/:catId', 'CategoryController.updateCategory');
    Route.delete('/groups/:groupId/categories/:catId', 'CategoryController.deleteCategory');

    Route.post('/category_transfer', 'CategoryController.transfer');
    Route.patch('/category_transfer/:tfrId', 'CategoryController.transfer');
    Route.delete('/category_transfer/:tfrId', 'CategoryController.transferDelete');

    Route.get('/category_balances', 'CategoryController.balances');

    Route.get('/category/:catId/transactions', 'CategoryController.transactions');
    Route.get('/category/history', 'CategoryController.history');

    Route.get('/connected_accounts', 'UsersController.getConnectedAccounts');

    Route.get('/account/:acctId/transactions', 'AccountsController.transactions');
    Route.get('/account/:acctId/balances', 'AccountsController.balances');

    Route.post('/institutions/sync', 'InstitutionController.syncAll');

    Route.post('/institution', 'InstitutionController.add');
    Route.get('/institution/:instId/info', 'InstitutionController.info');
    Route.get('/institution/:instId/accounts', 'InstitutionController.get');
    Route.post('/institution/:instId/accounts', 'InstitutionController.addAccounts');
    Route.post('/institution/:instId/accounts/:acctId/transactions/sync', 'InstitutionController.sync');
    Route.get('/institution/:instId/link_token', 'InstitutionController.linkToken');

    Route.get('/funding_plans', 'FundingPlanController.getAll');
    Route.post('/funding_plan', 'FundingPlanController.add');
    Route.get('/funding_plan/:planId', 'FundingPlanController.getPlan');
    Route.get('/funding_plan/:planId/details', 'FundingPlanController.getFullPlan');
    Route.put('/funding_plan/:planId/item/:catId', 'FundingPlanController.updateCategory');

    Route.patch('/transaction/:txId', 'InstitutionController.updateTx');
    Route.on('/fundingplans').render('fundingplans');

    Route.get('/reports/:report', 'ReportController.get');
}).middleware(['auth']);
