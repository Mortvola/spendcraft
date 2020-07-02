'use strict'

const moment = require('moment');

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class Transaction extends Model {
    acccountTransation() {
        return this.hasOne('App/Models/AccountTransaction');
    }

    categories() {
        return this.hasMany('App/Models/TransactionCategory');
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
}

module.exports = Transaction;
