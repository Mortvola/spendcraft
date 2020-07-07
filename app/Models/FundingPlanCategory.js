/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class FundingPlanCategory extends Model {
    static get Serializer() {
        return 'App/Serializer';
    }

    // eslint-disable-next-line class-methods-use-this
    getAmount(amount) {
        return parseFloat(amount);
    }
}

module.exports = FundingPlanCategory;
