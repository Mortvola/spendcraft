/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class CategoryTransfersSchema extends Schema {
    up() {
        this.drop('category_transfers');
    }
}

module.exports = CategoryTransfersSchema
