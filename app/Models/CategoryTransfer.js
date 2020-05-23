/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const CategorySplit = use('App/Models/CategorySplit');

class CategoryTransfer extends Model {

    splits (trx) {
        return CategorySplit.query(trx).where('transaction_id', -this.id);
    }
}

module.exports = CategoryTransfer
