'use strict'

const moment = require('moment');

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class AccountTransaction extends Model {
    static get Serializer() {
        return 'App/Serializer';
    }

    transaction() {
        return this.belongsTo('App/Models/Transaction');
    }

    categories() {
        return this.hasMany('App/Models/TransactionCategory', 'transaction_id', 'transaction_id');
    }

    static get dates() {
        return super.dates.concat(['date']);
    }

    static formatDates(field, value) {
        if (field === 'date') {
            return moment(value).format('YYYY-MM-DD');
        }
        return super.formatDates(field, value);
    }

    static castDates(field, value) {
        if (field === 'date') {
            return value.format('YYYY-MM-DD');
        }
        return super.formatDates(field, value);
    }

    // eslint-disable-next-line class-methods-use-this
    getAmount(amount) {
        return parseFloat(amount);
    }
}

module.exports = AccountTransaction;