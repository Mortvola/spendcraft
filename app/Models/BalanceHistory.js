'use strict'

const moment = require('moment');

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class BalanceHistory extends Model {
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
    getBalance(balance) {
        return parseFloat(balance);
    }
}

module.exports = BalanceHistory;
