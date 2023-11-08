import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('funding_amount', 12, 2).notNullable().defaultTo(0);
      table.boolean('use_goal').notNullable().defaultTo(false);
      table.date('goal_date');
      table.integer('recurrence').notNullable().defaultTo(1);
    })

    this.defer(async () => {
      const trx = await this.db.transaction();
  
      try {
        const source = await this.db.from('funding_plan_categories');
    
        await Promise.all(source.map(async (s) => (
          await this.db.from('funding_plan_categories')
          .from('categories')
          .update({
            funding_amount: s.amount,
            use_goal: s.use_goal,
            goal_date: s.goal_date,
            recurrence: s.recurrence,
           })
           .where('id', s.category_id)
        )))
  
        trx.commit();
      }
      catch (error) {
        console.log(error);
        trx.rollback
      }
    })
  }

  public async down () {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumns(
        'funding_amount',
        'use_goal',
        'goal_date',
        'recurrence',
      )
    })
  }
}
