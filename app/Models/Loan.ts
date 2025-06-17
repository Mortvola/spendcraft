/* eslint-disable import/no-cycle */
import {
  BaseModel, belongsTo, column, hasMany,
} from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon';
import Category from '#app/Models/Category';
import LoanTransaction from '#app/Models/LoanTransaction';
import { LoanTransactionsProps } from '#common/ResponseTypes';
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

export default class Loan extends BaseModel {
  @column({ isPrimary: true })
  public id: number;

  @column.dateTime({ serializeAs: null })
  public createdAt: DateTime;

  @column()
  public name: string;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public balance: number;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public startingBalance: number;

  @column.date()
  public startDate: DateTime;

  @column()
  public rate: number;

  @column({ serializeAs: null, columnName: 'application_id' })
  public budgetId: number;

  @hasMany(() => LoanTransaction)
  public loanTransactions: HasMany<typeof LoanTransaction>;

  @belongsTo(() => Category)
  public category: BelongsTo<typeof Category>

  @column({ serializeAs: null })
  public categoryId: number;

  // eslint-disable-next-line class-methods-use-this
  public async updateBalance(this: Loan): Promise<void> {
    // Iterate through all of the loan transactions and update the
    // principle and interest on each transaction as well as the final balance

    // const transactions = await this.related('loanTransactions')
    //   .query()
    //   .preload('transactionCategory', (transactionCategory) => {
    //     transactionCategory.preload('transaction');
    //   });

    // // Sort transactions by date
    // transactions.sort((a, b) => {
    //   if (a.transactionCategory.transaction.date < b.transactionCategory.transaction.date) {
    //     return -1;
    //   }

    //   if (a.transactionCategory.transaction.date > b.transactionCategory.transaction.date) {
    //     return 1;
    //   }

    //   return 0;
    // });

    // let balance = this.startingBalance;
    // let interestOwed = 0;
    // let { startDate } = this;
    // transactions.forEach((t) => {
    //   const numberOfDays = t.transactionCategory.transaction.date.diff(startDate, 'days').days;
    //   const rate = (this.rate / 365) * numberOfDays;

    //   const interest = -balance * (rate / 100.0) + interestOwed;
    //   interestOwed = 0;

    //   if (interest <= -t.transactionCategory.amount) {
    //     t.principle = -t.transactionCategory.amount - interest;
    //     balance += t.principle;
    //   }
    //   else {
    //     interestOwed = interest + t.transactionCategory.amount;
    //     t.principle = 0;
    //   }

    //   startDate = t.transactionCategory.transaction.date;
    // });

    // await Promise.all(transactions.map((t) => t.save()));

    // this.balance = balance;

    // await this.save();
  }

  // eslint-disable-next-line class-methods-use-this
  public async getProps(this: Loan): Promise<LoanTransactionsProps> {
    const result: LoanTransactionsProps = {
      balance: 0,
      transactions: [],
    };

    // result.balance = this.balance;

    // const loanTransactions = await this.related('loanTransactions').query()
    //   .preload('transactionCategory', (transactionCategory) => {
    //     transactionCategory.preload('transaction', (transaction) => {
    //       transaction.preload('accountTransaction');
    //     });
    //   });

    // result.transactions = loanTransactions.map((t) => (
    //   t.serialize() as LoanTransactionProps
    // ));

    // const startingBalance: LoanTransactionProps = {
    //   id: -1,
    //   loanId: this.id,
    //   principle: this.startingBalance,
    //   transactionCategory: {
    //     id: -1,
    //     amount: -this.startingBalance,
    //     transaction: {
    //       id: -1,
    //       date: this.startDate.toFormat('yyyy-MM-dd'),
    //       accountTransaction: {
    //         name: 'Starting Balance',
    //       },
    //     },
    //   },
    // };

    // result.transactions = result.transactions.concat(startingBalance);

    return result;
  }
}
