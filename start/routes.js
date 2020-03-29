'use strict'

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
const Route = use('Route')

Route.on('/').render('home')

Route.on('/fundingplans').render('fundingplans')

Route.post('login', 'UserController.login')
  .middleware('guest')

Route.get('users/:id', 'UserController.show')
  .middleware('auth')
  
Route.get ('/categories', 'CategoryController.get')
    
Route.get ('/category/:catId/transactions', 'CategoryController.transactions');

Route.get ('/connected_accounts', 'InstitutionController.all');

Route.get ('/account/:acctId/transactions', 'AccountController.transactions');

Route.post ('/institution', 'InstitutionController.add')
Route.get ('/institution/:instId/accounts', 'InstitutionController.get')
Route.post ('/institution/:instId/accounts', 'InstitutionController.addAccounts')
Route.post ('/institution/:instId/accounts/:acctId/transactions/sync', 'InstitutionController.sync');

Route.get ('/funding_plans', 'FundingPlanController.getAll');
Route.get ('/funding_plan/:planId', 'FundingPlanController.getPlan');

Route.patch ('/transaction/:txId', "InstitutionController.updateTx");
