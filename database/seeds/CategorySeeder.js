'use strict'

/*
|--------------------------------------------------------------------------
| CategorySeeder
|--------------------------------------------------------------------------
|
| Make use of the Factory instance to seed database with dummy data or
| make use of Lucid models directly.
|
*/

/** @type {import('@adonisjs/lucid/src/Factory')} */
const Factory = use('Factory')
const Database = use('Database')

class CategorySeeder {
  async run () {

	await Database.table('groups').insert ({id: -1, name: 'System'})

  	await Database.table('categories').insert({id: -1, group_id: -1, name: 'Funding Pool'})	
  	await Database.table('categories').insert({id: -2, group_id: -1, name: 'Unassigned'})	
  	await Database.table('categories').insert({id: -3, group_id: -1, name: 'Account Transfer'})	
  }
}

module.exports = CategorySeeder
