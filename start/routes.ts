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

// import HealthCheck from '@ioc:Adonis/Core/HealthCheck';
import router from '@adonisjs/core/services/router'
import env from '#start/env';
import drive from '@adonisjs/drive/services/main'
import { middleware } from '#start/kernel'

const HomeController = () => import('#controllers/HomeController')
const AuthController = () => import('#controllers/AuthController')
const UsersController = () => import('#controllers/UsersController')
const CategoriesController = () => import('#controllers/CategoriesController')
const AccountsController = () => import('#controllers/AccountsController')
const TransactionsController = () => import('#controllers/TransactionsController')
const InstitutionController = () => import('#controllers/InstitutionController')
const PlaidLogsController = () => import('#controllers/PlaidLogsController')
const AutoAssignmentsController = () => import('#controllers/AutoAssignmentsController')
const FundingPlanController = () => import("#controllers/FundingPlanController")
const WebhookController = () => import("#controllers/WebhookController")
const ReportController = () => import("#controllers/ReportController")
const LoansController = () => import("#controllers/LoansController")

router.get('/home', [HomeController, 'index']);
router.get('/home/:categoryId', [HomeController, 'index']);
router.get('/plans', [HomeController, 'index']);
router.get('/accounts', [HomeController, 'index']);
router.get('/accounts/:accountId', [HomeController, 'index']);
router.get('/reports', [HomeController, 'index']);
router.get('/signup', [HomeController, 'index']);
router.get('/signin', [HomeController, 'index']);
router.get('/recover-password', [HomeController, 'index']);
router.get('/user', [HomeController, 'index']);
router.get('/search', [HomeController, 'index']);
router.get('/auto-assignments', [HomeController, 'index']);
router.get('/logs', [HomeController, 'index']);
router.get('/admin', [HomeController, 'index']);
router.get('/bills', [HomeController, 'index']);
router.get('/', [HomeController, 'index']);

router.post('/wh', [WebhookController, 'post']);
router.post('/redirect', () => {
  console.log('redirected')
});

// Look for a gzipped file in the public directory
router.get('/:file', async ({ request, response, logger }) => {
  if (request.encoding(['gzip'])) {
    try {
      const filename = request.param('file');

      const disk = drive.use('fs')
      const contents = await disk.getBytes(`./${filename}.gz`)

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

// router.get('/health', async ({ response }) => {
//   const report = await HealthCheck.getReport();
//   return response.ok(report);
// });

router.get('/vapidPublicKey', async ({ response }) => {
  return response.ok(env.get('VAPID_PUBLIC_KEY'));
});

router.group(() => {
  router.group(() => {
    router.post('/register', [AuthController, 'register']);
    router.get('/verify-email/:token/:id', [AuthController, 'verifyEmail']);
    router.post('/login', [AuthController, 'login']);
    router.on('/email-verified').render('emailVerified');
    router.post('/code-request', [AuthController, 'requestCode']);
    router.post('/code-verify', [AuthController, 'verifyCode']);
  
    router.post('/refresh', [AuthController, 'refresh']);
  
    // Authentication required for this group of routes.
    router.group(() => {
      router.post('/password/update', [AuthController, 'updatePassword']).as('updatePassword');
      router.post('/logout', [AuthController, 'logout']);
  
      router.group(() => {
        router.get('', [UsersController, 'get']);
        router.patch('', [UsersController, 'update']);
        router.post('/pending-email/resend', [UsersController, 'resendEmailVerification']);
        router.delete('/pending-email', [UsersController, 'deletePending'])
        router.get('/link-token', [UsersController, 'getLinkToken']);
        router.post('/apns-token', [UsersController, 'addApnsToken'])
        router.post('/register-push/web', [UsersController, 'registerWebPush'])
        router.delete('', [UsersController, 'delete']);
      }).prefix('/user');
  
      router.group(() => {
        router.get('', [CategoriesController, 'get']);
        router.post('', [CategoriesController, 'addGroup']);
        router.patch('/:groupId', [CategoriesController, 'updateGroup']);
        router.delete('/:groupId', [CategoriesController, 'deleteGroup']);
        router.post('/:groupId/categories', [CategoriesController, 'addCategory']);
        router.patch('/:groupId/categories/:catId', [CategoriesController, 'updateCategory']);
        router.delete('/:groupId/categories/:catId', [CategoriesController, 'deleteCategory']);
      }).prefix('/groups');

      router.group(() => {
        router.get('', [CategoriesController, 'get'])
      }).prefix('/categories')
  
      router.group(() => {
        router.post('', [CategoriesController, 'transfer']);
        router.patch('/:tfrId', [CategoriesController, 'transfer']);
        router.delete('/:tfrId', [CategoriesController, 'transferDelete']);
      }).prefix('/category-transfer');
  
      router.get('/category-balances', [CategoriesController, 'balances']);
  
      router.group(() => {
        router.get('/transactions', [CategoriesController, 'transactions']);
      }).prefix('/category/:catId');
  
      router.get('/connected-accounts', [UsersController, 'getConnectedAccounts']);
  
      router.group(() => {
        router.patch('', [AccountsController, 'update']);
        router.post('/ofx', [AccountsController, 'uploadOfx']);

        router.group(() => {
          router.get('', [AccountsController, 'transactions']);
          router.post('', [AccountsController, 'addTransaction']);  
        })
          .prefix('/transactions')
    
        router.group(() => {
          router.get('', [AccountsController, 'balances']);
          router.post('', [AccountsController, 'addBalance']);
          router.delete('/:id', [AccountsController, 'deleteBalance']);
          router.patch('/:id', [AccountsController, 'updateBalance']);    
        })
          .prefix('/balances')

        router.group(() => {
          router.get('', [AccountsController, 'getStatements'])
          router.post('', [AccountsController, 'addStatement'])
        })
          .prefix('/statements')
      })
        .prefix('/account/:acctId');
  
      router.group(() => {
        router.patch('/:statementId', [AccountsController, 'updateStatement'])
      })
        .prefix('/statements')

      router.group(() => {
        router.delete('/:id', [AccountsController, 'deleteBalance']);
      })
        .prefix('/balance');
  
      router.post('/institutions/sync', [InstitutionController, 'syncAll']);
  
      router.group(() => {
        router.post('', [InstitutionController, 'add']);
        router.post('/:instId', [InstitutionController, 'update']);
        router.get('/:instId/info', [InstitutionController, 'info']);
        router.get('/:instId/accounts', [InstitutionController, 'get']);
        router.post('/:instId/accounts', [InstitutionController, 'addOfflineAccount']);
        router.post('/:instId/accounts/:acctId/transactions/sync', [InstitutionController, 'sync']);
        router.delete('/:instId/accounts/:acctId', [InstitutionController, 'deleteAccount']);
        router.delete('/:instId', [InstitutionController, 'delete']);
        router.get('/:instId/link-token', [InstitutionController, 'linkToken']);
      }).prefix('/institution');
  
      router.group(() => {
        router.get('/', [FundingPlanController, 'getPlan']);
        router.get('/proposed', [FundingPlanController, 'getProposed']);
        router.put('/item/:catId', [FundingPlanController, 'updateOrCreateCategory']);
      }).prefix('/funding-plans');
  
      router.group(() => {
        router.patch('/:trxId', [TransactionsController, 'update']);
        router.delete('/:trxId', [TransactionsController, 'delete']);
        router.get('/:trxId', [TransactionsController, 'get']);
        router.post('/:trxId/dedup', [TransactionsController, 'dedup']);
      }).prefix('/transaction');
  
      router.get('/transactions', [TransactionsController, 'getMultiple'])
  
      router.get('/reports/:report', [ReportController, 'get']);
  
      router.group(() => {
        router.post('', [LoansController, 'add']);
  
        router.group(() => {
          router.get('', [LoansController, 'get']);
          router.patch('', [LoansController, 'update']);
          router.get('/transactions', [LoansController, 'getTransactions']);  
        })
          .prefix('/:catId');
      })
        .prefix('/loans');
  
      router.get('/rebalances', [TransactionsController, 'getRebalances'])    

      router.get('/transactions/search', [TransactionsController, 'search']);

      router.group(() => {
        router.get('/:id?', [AutoAssignmentsController, 'get']);
        router.post('/', [AutoAssignmentsController, 'post']);
        router.patch('/:id', [AutoAssignmentsController, 'patch']);
        router.delete('/:id', [AutoAssignmentsController, 'delete']);
      })
        .prefix('/auto-assignments')

      router.get('/transaction-logs', [TransactionsController, 'logs']);

      router.get('/bills', [CategoriesController, 'getBills']);

      router.group(() => {
        router.get('/plaid-logs', [PlaidLogsController, 'get'])
      })
        .prefix('/admin')
        .use(middleware.admin());
    })
      .use(middleware.auth());
  })
  .prefix('/v1')
})
  .prefix('/api')
