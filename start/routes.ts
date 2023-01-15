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

Route.get('/home', 'HomeController.index');
Route.get('/home/:categoryId', 'HomeController.index');
Route.get('/plans', 'HomeController.index');
Route.get('/accounts', 'HomeController.index');
Route.get('/accounts/:accountId', 'HomeController.index');
Route.get('/reports', 'HomeController.index');
Route.get('/signup', 'HomeController.index');
Route.get('/signin', 'HomeController.index');
Route.get('/recover-password', 'HomeController.index');
Route.get('/reset-password', 'HomeController.index');
Route.get('/', 'HomeController.index');

Route.post('/wh', 'WebhookController.post');

Route.get('/health', async ({ response }) => {
  const report = await HealthCheck.getReport();
  return response.ok(report);
});

Route.group(() => {
  Route.post('/register', 'AuthController.register');
  Route.get('/verify-email/:token/:id', 'AuthController.verifyEmail');
  Route.post('/login', 'AuthController.login');
  Route.on('/email-verified').render('emailVerified');
  Route.post('/password/email', 'AuthController.forgotPassword');
  Route.get('/password/reset/:token/:id', 'AuthController.resetPassword');
  Route.post('/password/update', 'AuthController.updatePassword').as('updatePassword');
  
  Route.group(() => {
    Route.post('/logout', 'AuthController.logout');

    Route.group(() => {
      Route.get('', 'UsersController.get');
      Route.patch('', 'UsersController.update');
      Route.post('/pending-email/resend', 'UsersController.resendEmailVerification');
      Route.delete('/pending-email', 'UsersController.deletePending')
      Route.get('/link-token', 'UsersController.getLinkToken');
      Route.post('/apns-token', 'UsersController.addApnsToken')
    }).prefix('/user');

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
      Route.get('/transactions', 'CategoryController.transactions');
      Route.get('/transactions/pending', 'CategoryController.pendingTransactions');
    }).prefix('/category/:catId');

    Route.get('/connected-accounts', 'UsersController.getConnectedAccounts');

    Route.group(() => {
      Route.get('/transactions', 'AccountsController.transactions');
      Route.get('/transactions/pending', 'AccountsController.pendingTransactions');
      Route.post('/transactions', 'AccountsController.addTransaction');
      Route.get('/balances', 'AccountsController.balances');
      Route.post('/balances', 'AccountsController.addBalance');
      Route.patch('', 'AccountsController.update');
      Route.delete('/balances/:id', 'AccountsController.deleteBalance');
      Route.patch('/balances/:id', 'AccountsController.updateBalance');
      Route.post('/ofx', 'AccountsController.uploadOfx');
    })
      .prefix('/account/:acctId');

    Route.group(() => {
      Route.delete('/:id', 'AccountsController.deleteBalance');
    })
      .prefix('/balance');

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
      Route.put('/:planId/item/:catId', 'FundingPlanController.updateOrCreateCategory');
    }).prefix('/funding-plans');

    Route.group(() => {
      Route.patch('/:trxId', 'TransactionsController.update');
      Route.delete('/:trxId', 'TransactionsController.delete');
      Route.get('/:trxId', 'TransactionsController.get');
      Route.post('/:trxId/dedup', 'TransactionsController.dedup');
    }).prefix('/transaction');

    Route.get('/transactions', 'TransactionsController.getMultiple')

    Route.get('/reports/:report', 'ReportController.get');

    Route.group(() => {
      Route.post('', 'LoansController.add');

      Route.group(() => {
        Route.get('', 'LoansController.get');
        Route.patch('', 'LoansController.update');
        Route.get('/transactions', 'LoansController.getTransactions');  
      })
        .prefix('/:catId');
    })
      .prefix('/loans');

    Route.get('/rebalances', 'TransactionsController.getRebalances')    
  })
  .middleware(['auth']);
})
  .prefix('/api')
