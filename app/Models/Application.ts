/* eslint-disable import/no-cycle */
import { DateTime } from 'luxon'
import {
  BaseModel, column, HasMany, hasMany, ModelAdapterOptions,
} from '@ioc:Adonis/Lucid/Orm'
import Database from '@ioc:Adonis/Lucid/Database';
import { InstitutionProps, TransactionType } from 'Common/ResponseTypes';
import User from 'App/Models/User'
import Category from 'App/Models/Category';
import Group from 'App/Models/Group';
import FundingPlan from 'App/Models/FundingPlan';
import Institution from 'App/Models/Institution';
import Transaction from 'App/Models/Transaction';
import Loan from 'App/Models/Loan';
import CategoryHistoryItem from 'App/Models/CategoryHistoryItem';

export default class Application extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true, serializeAs: null })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime

  @column()
  public userId: number;

  @hasMany(() => User)
  public users: HasMany<typeof User>;

  @hasMany(() => Institution)
  public institutions: HasMany<typeof Institution>;

  @hasMany(() => Transaction)
  public transactions: HasMany<typeof Transaction>;

  @hasMany(() => Loan)
  public loans: HasMany<typeof Loan>;

  @hasMany(() => Group)
  public groups: HasMany<typeof Group>;

  @hasMany(() => FundingPlan)
  public plans: HasMany<typeof FundingPlan>;

  public async history(this: Application, numberOfMonths: number): Promise<CategoryHistoryItem[]> {
    const startDate = DateTime.now().set({
      hour: 0, minute: 0, second: 0, millisecond: 0,
    });
    const endDate = startDate.minus({ months: numberOfMonths }).set({
      hour: 0, minute: 0, second: 0, millisecond: 0,
    });

    const data = await Database.query()
      .select(
        Database.raw('CAST(EXTRACT(MONTH FROM date) AS integer) AS month'),
        Database.raw('CAST(EXTRACT(YEAR FROM date) AS integer) AS year'),
        'cats.id AS id',
        Database.raw(`CAST(
          sum(
            CASE WHEN trans.type not in (${TransactionType.FUNDING_TRANSACTION}, ${TransactionType.REBALANCE_TRANSACTION}) THEN
              transcats.amount
            ELSE
              0
            END
            ) AS float) AS expenses
        `),
        Database.raw(`CAST(
          sum(
            CASE WHEN trans.type = ${TransactionType.FUNDING_TRANSACTION} THEN
              transcats.amount
            ELSE
              0
            END
            ) AS float) AS funding
        `),
      )
      .from('transaction_categories AS transcats')
      .join('transactions AS trans', 'trans.id', 'transcats.transaction_id')
      .join('categories AS cats', 'cats.id', 'transcats.category_id')
      .where('trans.application_id', this.id)
      .andWhere('trans.date', '>=', endDate.toISODate())
      .groupBy('month', 'year', 'cats.id')
      .orderBy('cats.id')
      .orderBy('year', 'desc')
      .orderBy('month', 'desc');

    const history: CategoryHistoryItem[] = [];
    let currentCategory: CategoryHistoryItem | null = null;

    let month = 0;
    let year = 0;

    const decrementMonth = () => {
      month -= 1;

      if (month < 1) {
        year -= 1;
        month = 12;
      }
    }

    data.forEach((category) => {
      if (currentCategory === null || category.id !== currentCategory.id) {
        month = startDate.month;
        year = startDate.year;

        history.push({
          id: category.id,
          months: [],
        });
        currentCategory = history[history.length - 1];
      }

      if (currentCategory === null) {
        throw new Error('category is null');
      }

      while (month !== category.month || year !== category.year) {
        currentCategory.months.push({ expenses: 0, funding: 0 })
        decrementMonth();
      }

      currentCategory.months.push({ expenses: category.expenses, funding: category.funding });
      decrementMonth();
    });

    return history;
  }

  public async getConnectedAccounts(this: Application): Promise<InstitutionProps[]> {
    const result = await this
      .related('institutions').query()
      .preload('accounts');

    return result.map((i) => ({
      id: i.id,
      name: i.name,
      offline: i.plaidItemId === null,
      accounts: i.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        closed: a.closed,
        type: a.type,
        subtype: a.subtype,
        tracking: a.tracking,
        syncDate: a.syncDate !== null ? a.syncDate.toISO() : null,
        balance: a.balance,
        plaidBalance: a.plaidBalance,
        rate: a.rate,
      })),
    }));
  }

  public async getUnassignedCategory(options?: ModelAdapterOptions): Promise<Category> {
    return await Category.query(options)
      .where('type', 'UNASSIGNED')
      .whereHas('group', (query) => query.where('applicationId', this.id))
      .firstOrFail();
  }

  public async getFundingPoolCategory(options?: ModelAdapterOptions): Promise<Category> {
    return await Category.query(options)
      .where('type', 'FUNDING POOL')
      .whereHas('group', (query) => query.where('applicationId', this.id))
      .firstOrFail();
  }

  public async getAccountTransferCategory(options?: ModelAdapterOptions): Promise<Category> {
    return await Category.query(options)
      .where('type', 'ACCOUNT TRANSFER')
      .whereHas('group', (query) => query.where('applicationId', this.id))
      .firstOrFail();
  }

  public async getSystemGroup(options?: ModelAdapterOptions): Promise<Group> {
    return await Group.query(options)
      .where('type', 'SYSTEM')
      .andWhere('applicationId', this.id)
      .firstOrFail();
  }

  public async initialize(this: Application): Promise<void> {
    if (this.$trx === undefined) {
      throw new Error('transaction must be defined');
    }

    const systemGroup = await (new Group()).useTransaction(this.$trx)
      .fill({
        name: 'System',
        type: 'SYSTEM',
        applicationId: this.id,
        system: true,
      })
      .save();

    await (new Category()).useTransaction(this.$trx)
      .fill({
        name: 'Unassigned',
        type: 'UNASSIGNED',
        amount: 0,
        groupId: systemGroup.id,
      })
      .save();

    await (new Category()).useTransaction(this.$trx)
      .fill({
        name: 'Funding Pool',
        type: 'FUNDING POOL',
        amount: 0,
        groupId: systemGroup.id,
      })
      .save();

    await (new Category()).useTransaction(this.$trx)
      .fill({
        name: 'Account Transfer',
        type: 'ACCOUNT TRANSFER',
        amount: 0,
        groupId: systemGroup.id,
      })
      .save();

    await (new Group()).useTransaction(this.$trx)
      .fill({
        name: 'NoGroup',
        type: 'NO GROUP',
        applicationId: this.id,
        system: true,
      })
      .save();

    await (new FundingPlan()).useTransaction(this.$trx)
      .fill({
        name: 'Default Plan',
        applicationId: this.id,
      })
      .save();
  }
}
