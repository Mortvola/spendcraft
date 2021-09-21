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

import HealthCheck from '@ioc:Adonis/Core/HealthCheck';
import Route from '@ioc:Adonis/Core/Route'

Route.get('/', 'HomeController.index');

Route.post('/wh', 'WebhookController.post');

Route.get('/health', async ({ response }) => {
  const report = await HealthCheck.getReport();
  return response.ok(report);
});

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
    Route.get('/user/link-token', 'UsersController.getLinkToken');

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

    Route.group(() => {
      Route.post('', 'CategoryController.transfer');
      Route.patch('/:tfrId', 'CategoryController.transfer');
      Route.delete('/:tfrId', 'CategoryController.transferDelete');
    }).prefix('/category-transfer');

    Route.get('/category-balances', 'CategoryController.balances');

    Route.group(() => {
      Route.get('/:catId/transactions', 'CategoryController.transactions');
      Route.get('/:catId/transactions/pending', 'CategoryController.pendingTransactions');
      Route.get('/history', 'CategoryController.history');
    }).prefix('/category');

    Route.get('/connected-accounts', 'UsersController.getConnectedAccounts');

    Route.group(() => {
      Route.get('/:acctId/transactions', 'AccountsController.transactions');
      Route.get('/:acctId/transactions/pending', 'AccountsController.pendingTransactions');
      Route.post('/:acctId/transactions', 'AccountsController.addTransaction');
      Route.get('/:acctId/balances', 'AccountsController.balances');
      Route.patch('/:acctId', 'AccountsController.update');
    }).prefix('/account');

    Route.post('/institutions/sync', 'InstitutionController.syncAll');

    Route.group(() => {
      Route.post('', 'InstitutionController.add');
      Route.get('/:instId/info', 'InstitutionController.info');
      Route.get('/:instId/accounts', 'InstitutionController.get');
      Route.post('/:instId/accounts', 'InstitutionController.addAccounts');
      Route.post('/:instId/accounts/:acctId/transactions/sync', 'InstitutionController.sync');
      Route.delete('/:instId/accounts/:acctId', 'InstitutionController.deleteAccount');
      Route.delete('/:instId', 'InstitutionController.delete');
      Route.get('/:instId/link-token', 'InstitutionController.linkToken');
    }).prefix('/institution');

    Route.group(() => {
      Route.get('', 'FundingPlanController.getAll');
      Route.post('', 'FundingPlanController.add');
      Route.get('/:planId', 'FundingPlanController.getPlan');
      Route.get('/:planId/details', 'FundingPlanController.getFullPlan');
      Route.put('/:planId/item/:catId', 'FundingPlanController.updateCategory');
    }).prefix('/funding-plans');

    Route.group(() => {
      Route.patch('/:txId', 'TransactionsController.update');
      Route.delete('/:trxId', 'TransactionsController.delete');
    }).prefix('/transaction');

    Route.get('/reports/:report', 'ReportController.get');

    Route.group(() => {
      Route.post('', 'LoansController.add');
      Route.get('/:catId', 'LoansController.get');
      Route.patch('/:catId', 'LoansController.update');
      Route.get('/:catId/transactions', 'LoansController.getTransactions');
    }).prefix('/loans');

}).prefix('/api').middleware(['auth']);
