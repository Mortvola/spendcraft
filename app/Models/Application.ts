/* eslint-disable import/no-cycle */
import { DateTime } from 'luxon'
import {
  BaseModel, column, HasMany, hasMany, ModelAdapterOptions,
} from '@ioc:Adonis/Lucid/Orm'
import Database from '@ioc:Adonis/Lucid/Database';
import { InstitutionProps } from 'Common/ResponseTypes';
import User from 'App/Models/User'
import Category from 'App/Models/Category';
import Group from 'App/Models/Group';
import FundingPlan from 'App/Models/FundingPlan';
import Institution from 'App/Models/Institution';
import Transaction from 'App/Models/Transaction';
import Loan from 'App/Models/Loan';
import { GroupHistoryItem, CategoryHistoryItem } from 'App/Models/GroupHistoryItem';

export default class Application extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
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

  public async history(this: Application): Promise<Array<GroupHistoryItem>> {
    const data = await Database.query()
      .select(
        Database.raw('EXTRACT(MONTH FROM date) AS month'),
        Database.raw('EXTRACT(YEAR FROM date) AS year'),
        'groups.id AS groupId',
        'groups.name AS groupName',
        'cats.id AS categoryId',
        'cats.name as categoryName',
        Database.raw('CAST(sum(transcats.amount) AS float) AS amount'),
      )
      .from('transaction_categories AS transcats')
      .join('transactions AS trans', 'trans.id', 'transcats.transaction_id')
      .join('categories AS cats', 'cats.id', 'transcats.category_id')
      .join('groups', 'groups.id', 'cats.group_id')
      .where('trans.application_id', this.id)
      .where('groups.id', '!=', -1)
      .whereNotIn('trans.type', [2, 3])
      .groupBy('month', 'year', 'groups.id', 'groups.name', 'cats.id', 'cats.name')
      .orderBy('groups.name')
      .orderBy('cats.name')
      .orderBy('year')
      .orderBy('month');

    const history: GroupHistoryItem[] = [];
    let currentGroup: GroupHistoryItem | null = null;
    let currentCategory: CategoryHistoryItem | null = null;

    data.forEach((item) => {
      if (currentGroup === null || item.groupId !== currentGroup.id) {
        history.push({
          id: item.groupId,
          name: item.groupName,
          categories: [],
        });
        currentGroup = history[history.length - 1];
        currentCategory = null;
      }

      if (currentCategory === null || item.categoryId !== currentCategory.id) {
        currentGroup.categories.push({ id: item.categoryId, months: [] });
        currentCategory = currentGroup.categories[currentGroup.categories.length - 1];
      }

      if (currentCategory === null) {
        throw new Error('category is null');
      }

      currentCategory.months.push({
        year: item.year,
        month: item.month,
        amount: item.amount,
      });
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

    await this.$trx.commit();
  }
}
