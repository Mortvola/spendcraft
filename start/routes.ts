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
import Env from '@ioc:Adonis/Core/Env';
import Drive from '@ioc:Adonis/Core/Drive'

Route.get('/home', 'HomeController.index');
Route.get('/home/:categoryId', 'HomeController.index');
Route.get('/plans', 'HomeController.index');
Route.get('/accounts', 'HomeController.index');
Route.get('/accounts/:accountId', 'HomeController.index');
Route.get('/reports', 'HomeController.index');
Route.get('/signup', 'HomeController.index');
Route.get('/signin', 'HomeController.index');
Route.get('/recover-password', 'HomeController.index');
Route.get('/user', 'HomeController.index');
Route.get('/', 'HomeController.index');

Route.post('/wh', 'WebhookController.post');
Route.post('/redirect', () => {
  console.log('redirected')
});

// Look for a gzipped file in the public directory
Route.get('/:file', async ({ request, response, logger }) => {
  if (request.encoding(['gzip'])) {
    try {
      const filename = request.param('file');

      const contents = await Drive.get(`public/${filename}.gz`)

      response.header('Content-Encoding', 'gzip');

      if (/.*.js$/.test(filename) || /.*js.map$/.test(filename)) {
        response.header('Content-Type', 'application/javascript');
      }
      else if (/.*.css$/.test(filename)) {
        response.header('Content-Type', 'text/css');
      }
      
      return response.ok(contents);
    }
    catch (error) {
      logger.error(error);
    }
  }

  return response.notFound();
})
.where('file', /.*.(js|css|map)$/)

Route.get('/health', async ({ response }) => {
  const report = await HealthCheck.getReport();
  return response.ok(report);
});

Route.get('/vapidPublicKey', async ({ response }) => {
  return response.ok(Env.get('VAPID_PUBLIC_KEY'));
});

Route.group(() => {
  Route.group(() => {
    Route.post('/register', 'AuthController.register');
    Route.get('/verify-email/:token/:id', 'AuthController.verifyEmail');
    Route.post('/login', 'AuthController.login');
    Route.on('/email-verified').render('emailVerified');
    Route.post('/code-request', 'AuthController.requestCode');
    Route.post('/code-verify', 'AuthController.verifyCode');
  
    Route.post('/refresh', 'AuthController.refresh');
  
    // Authentication required for this group of routes.
    Route.group(() => {
      Route.post('/password/update', 'AuthController.updatePassword').as('updatePassword');
      Route.post('/logout', 'AuthController.logout');
  
      Route.group(() => {
        Route.get('', 'UsersController.get');
        Route.patch('', 'UsersController.update');
        Route.post('/pending-email/resend', 'UsersController.resendEmailVerification');
        Route.delete('/pending-email', 'UsersController.deletePending')
        Route.get('/link-token', 'UsersController.getLinkToken');
        Route.post('/apns-token', 'UsersController.addApnsToken')
        Route.post('/register-push/web', 'UsersController.registerWebPush')
        Route.delete('', 'UsersController.delete');
      }).prefix('/user');
  
      Route.group(() => {
        Route.get('', 'CategoryController.get');
        Route.post('', 'CategoryController.addGroup');
        Route.patch('/:groupId', 'CategoryController.updateGroup');
        Route.delete('/:groupId', 'CategoryController.deleteGroup');
        Route.post('/:groupId/categories', 'CategoryController.addCategory');
        Route.patch('/:groupId/categories/:catId', 'CategoryController.updateCategory');
        Route.delete('/:groupId/categories/:catId', 'CategoryController.deleteCategory');
      }).prefix('/groups');

      Route.group(() => {
        Route.get('', 'CategoryController.get')
      }).prefix('/categories')
  
      Route.group(() => {
        Route.post('', 'CategoryController.transfer');
        Route.patch('/:tfrId', 'CategoryController.transfer');
        Route.delete('/:tfrId', 'CategoryController.transferDelete');
      }).prefix('/category-transfer');
  
      Route.get('/category-balances', 'CategoryController.balances');
  
      Route.group(() => {
        Route.get('/transactions', 'CategoryController.transactions');
      }).prefix('/category/:catId');
  
      Route.get('/connected-accounts', 'UsersController.getConnectedAccounts');
  
      Route.group(() => {
        Route.get('/transactions', 'AccountsController.transactions');
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
        Route.post('/:instId', 'InstitutionController.update');
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
        Route.get('/:planId/proposed', 'FundingPlanController.getProposed');
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
  .prefix('/v1')
})
  .prefix('/api')
