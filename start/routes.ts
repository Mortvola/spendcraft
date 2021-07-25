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
  Route.get('/activate/:token/:id', 'AuthController.verifyEmail');
  Route.post('/login', 'AuthController.login');
  Route.on('/email-verified').render('emailVerified');
  Route.post('/password/email', 'AuthController.forgotPassword');
  Route.get('/password/reset/:id/:token', 'AuthController.resetPassword');
  Route.post('/password/update', 'AuthController.updatePassword').as('updatePassword');
}); // .middleware('guest');

Route.group(() => {
    Route.post('/logout', 'AuthController.logout');

    Route.get('/user', 'UsersController.get');
    Route.get('/user/link_token', 'UsersController.getLinkToken');

    Route.group(() => {
      Route.get('', 'CategoryController.get');
      Route.post('', 'CategoryController.addGroup');
      Route.patch('/:groupId', 'CategoryController.updateGroup');
      Route.delete('/:groupId', 'CategoryController.deleteGroup');
      Route.get('/:groupId/categories', 'CategoryController.get');
      Route.post('/:groupId/categories', 'CategoryController.addCategory');
      Route.patch('/:groupId/categories/:catId', 'CategoryController.updateCategory');
      Route.delete('/:groupId/categories/:catId', 'CategoryController.deleteCategory');
    }).prefix('/groups');

    Route.post('/category_transfer', 'CategoryController.transfer');
    Route.patch('/category_transfer/:tfrId', 'CategoryController.transfer');
    Route.delete('/category_transfer/:tfrId', 'CategoryController.transferDelete');

    Route.delete('/transaction/:trxId', 'TransactionsController.delete');

    Route.get('/category_balances', 'CategoryController.balances');

    Route.get('/category/:catId/transactions', 'CategoryController.transactions');
    Route.get('/category/history', 'CategoryController.history');

    Route.get('/connected_accounts', 'UsersController.getConnectedAccounts');

    Route.get('/account/:acctId/transactions', 'AccountsController.transactions');
    Route.get('/account/:acctId/balances', 'AccountsController.balances');

    Route.post('/institutions/sync', 'InstitutionController.syncAll');

    Route.group(() => {
      Route.post('', 'InstitutionController.add');
      Route.get('/:instId/info', 'InstitutionController.info');
      Route.get('/:instId/accounts', 'InstitutionController.get');
      Route.post('/:instId/accounts', 'InstitutionController.addAccounts');
      Route.post('/:instId/accounts/:acctId/transactions/sync', 'InstitutionController.sync');
      Route.get('/:instId/link_token', 'InstitutionController.linkToken');
    }).prefix('/institution');

    Route.group(() => {
      Route.get('', 'FundingPlanController.getAll');
      Route.post('', 'FundingPlanController.add');
      Route.get('/:planId', 'FundingPlanController.getPlan');
      Route.get('/:planId/details', 'FundingPlanController.getFullPlan');
      Route.put('/:planId/item/:catId', 'FundingPlanController.updateCategory');
    }).prefix('/funding-plans');

    Route.patch('/transaction/:txId', 'InstitutionController.updateTx');
    Route.on('/fundingplans').render('fundingplans');

    Route.get('/reports/:report', 'ReportController.get');

    Route.group(() => {
      Route.post('', 'LoansController.add');
      Route.get('/:loanId/transactions', 'LoansController.getTransations');
    }).prefix('/loans');

}).prefix('/api').middleware(['auth']);
