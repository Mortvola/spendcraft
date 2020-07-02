'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model');

class TransactionCategory extends Model {
    static get Serializer() {
        return 'App/Serializer';
    }

    category() {
        return this.belongsTo('App/Models/Category');
    }
}

module.exports = TransactionCategory;
