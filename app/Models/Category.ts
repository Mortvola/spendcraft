/* eslint-disable import/no-cycle */
import {
  BaseModel, BelongsTo, belongsTo, column,
} from '@ioc:Adonis/Lucid/Orm';
import Database from '@ioc:Adonis/Lucid/Database';
import Group from '#app/Models/Group';
import { CategoryType, TransactionType } from '#common/ResponseTypes';
import Budget from '#app/Models/Budget';
import { DateTime } from 'luxon';

type CategoryItem = {
  id: number,
  name: string,
  type: CategoryType,
  balance: number,
};

type GroupItem = {
  id: number,
  name: string,
  system: boolean,
  categories: (CategoryItem | { id: number, name: string})[],
};

type FundingCategory = {
  categoryId: number,
  amount: number,
  percentage: boolean,
}

export default class Category extends BaseModel {
  @column()
  public id: number;

  @belongsTo(() => Group)
  public group: BelongsTo<typeof Group>;

  @column()
  public name: string;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public balance: number;

  @column()
  public type: CategoryType;

  @column()
  public groupId: number;

  @column()
  public hidden: boolean;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public fundingAmount: number;

  @column()
  public includeFundingTransfers: boolean;

  @column()
  public useGoal: boolean;

  @column.date()
  public goalDate: DateTime | null;

  @column()
  public recurrence: number;

  @column({
    prepare: (value: FundingCategory[]) => JSON.stringify(value),
  })
  public fundingCategories: FundingCategory[];

  @column()
  public suspended: boolean;

  // @hasMany(() => Transaction)
  // public transaction: HasMany<typeof Transaction>;

  public static async balances(
    budget: Budget,
    date: string,
    transactionId: number,
  ): Promise<GroupItem[]> {
    const subQuery = Database.query()
      .select('categoryId')
      .select(Database.raw('sum("transCats".amount) as amount'))
      .from('transactions')
      // eslint-disable-next-line max-len
      .joinRaw('cross join lateral jsonb_to_recordset(transactions.categories) as "transCats"("categoryId" int, amount decimal)')
      .where((query) => {
        query
          .where('date', '>', date)
          .where('deleted', false)
      })
      .groupBy('categoryId');

    // Ignore the transaction identified by transactionId, if any
    if (transactionId !== undefined) {
      subQuery.orWhere('transactions.id', transactionId);
    }

    const query = Database.query()
      .select(
        'c.id',
        Database.raw('CAST(c.balance - sum(coalesce(tc.amount, 0)) as float) as balance'),
      )
      .from('categories as c')
      .join('groups', (groups) => {
        groups.on('groups.id', 'c.group_id')
          .andOnVal('groups.application_id', budget.id)
      })
      .joinRaw(`left outer join (${
        subQuery.toQuery()
      }) as tc on tc."categoryId" = c.id`)
      .groupBy('c.id')
      .groupByRaw('coalesce(tc.amount, 0)')

    return query;
  }

  private getTransactionQuery(budget: Budget) {
    return budget
      .related('transactions').query()
      .where('deleted', false)
      // eslint-disable-next-line max-len
      .whereRaw('categories::jsonb @\\? (\'$[*] \\? (@.categoryId == \' || ? || \' && @.amount != 0)\')::jsonpath', [this.id])
      .where((q) => {
        q.whereHas('accountTransaction', (q2) => {
          q2
            .andWhereHas('account', (q3) => {
              q3.where('tracking', 'Transactions')
                .andWhereColumn('startDate', '<=', 'transactions.date')
            })
        })
          .orDoesntHave('accountTransaction')
      })
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
  }

  public async transactions(budget: Budget, limit?: number, offset?: number) {
    const transactionQuery = this.getTransactionQuery(budget);

    transactionQuery
      .orderBy('transactions.date', 'desc')
      .orderByRaw(`
        CASE
          WHEN transactions.type = ${TransactionType.STARTING_BALANCE} THEN 2
          WHEN transactions.type = ${TransactionType.FUNDING_TRANSACTION} THEN 1
          WHEN transactions.type = ${TransactionType.REBALANCE_TRANSACTION} THEN -1
          ELSE 0
        END asc`)
      .orderByRaw('COALESCE(transactions.duplicate_of_transaction_id, transactions.id) desc')
      .orderBy('transactions.id', 'desc')

    if (limit !== undefined) {
      transactionQuery
        .limit(limit)
    }

    if (offset !== undefined) {
      transactionQuery
        .offset(offset);
    }

    return transactionQuery;
  }

  public async transactionsCount(budget: Budget): Promise<number> {
    await budget.loadAggregate('transactions', (q) => {
      q.count('*').as('count')
        .where('deleted', false)
        // eslint-disable-next-line max-len
        .whereRaw('categories::jsonb @\\? (\'$[*] \\? (@.categoryId == \' || ? || \' && @.amount != 0)\')::jsonpath', [this.id])
        .where((q4) => {
          q4.whereHas('accountTransaction', (q2) => {
            q2
              .andWhereHas('account', (q3) => {
                q3.where('tracking', 'Transactions')
                  .andWhereColumn('startDate', '<=', 'transactions.date')
              })
          })
            .orDoesntHave('accountTransaction')
        })
    });

    return parseInt(budget.$extras.count, 10);
  }

  // eslint-disable-next-line class-methods-use-this
  public async syncBalance(this: Category): Promise<void> {
    // let sum = 0;

    // const tc = await this.related('transactionCategory').query()
    //   .sum('amount')
    //   .whereHas('transaction', (q) => {
    //     q.whereHas('accountTransaction', (q2) => {
    //       q2.where('pending', false)
    //         .whereHas('account', (q3) => {
    //           q3.where('tracking', 'Transactions')
    //             .whereColumn('startDate', '<=', 'transactions.date')
    //         })
    //     })
    //       .orDoesntHave('accountTransaction')
    //   })

    // sum = tc[0].$extras.sum ?? 0;

    // await this.merge({
    //   balance: sum,
    // })
    //   .save();
  }
}

export { GroupItem, CategoryItem };
