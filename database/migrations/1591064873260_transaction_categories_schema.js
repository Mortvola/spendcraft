/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TransactionCategoriesSchema extends Schema {
    up() {
        this.rename('category_splits', 'transaction_categories');
    }

    down() {
        this.rename('transaction_categories', 'category_splits');
    }
}

module.exports = TransactionCategoriesSchema
