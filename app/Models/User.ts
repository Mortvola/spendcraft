/* eslint-disable import/no-cycle */
import Database from '@ioc:Adonis/Lucid/Database';
import { DateTime } from 'luxon';
import Hash from '@ioc:Adonis/Core/Hash'
import {
  column,
  beforeSave,
  BaseModel,
  hasMany,
  HasMany,
  ModelAdapterOptions,
} from '@ioc:Adonis/Lucid/Orm';
import Transaction from 'App/Models/Transaction'
import Loan from 'App/Models/Loan';
import Institution from 'App/Models/Institution';
import { InstitutionProps } from 'Common/ResponseTypes';
import Category from './Category';

type MonthBalance = {
  year: number,
  month: number,
  amount: number,
}

export type CategoryHistoryItem = {
  id: number,
  months: Array<MonthBalance>,
};

export type GroupHistoryItem = {
  id: number,
  name: string,
  categories: Array<CategoryHistoryItem>,
};

export default class User extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public username: string;

  @column()
  public email: string

  @column({ serializeAs: null })
  public password: string

  @column()
  public activated: boolean;

  @column()
  public rememberMeToken?: string

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @beforeSave()
  public static async hashPassword(user: User): Promise<void> {
    if (user.$dirty.password) {
      user.password = await Hash.make(user.password);
    }
  }

  @hasMany(() => Institution)
  public institutions: HasMany<typeof Institution>;

  @hasMany(() => Transaction)
  public transactions: HasMany<typeof Transaction>;

  @hasMany(() => Loan)
  public loans: HasMany<typeof Loan>;

  public async history(this: User): Promise<Array<GroupHistoryItem>> {
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
      .where('trans.user_id', this.id)
      .where('groups.id', '!=', -1)
      .whereNotIn('trans.type', [2, 3])
      .groupBy('month', 'year', 'groups.id', 'groups.name', 'cats.id', 'cats.name')
      .orderBy('groups.name')
      .orderBy('cats.name')
      .orderBy('year')
      .orderBy('month');

    const history: Array<GroupHistoryItem> = [];
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

  public async getConnectedAccounts(this: User): Promise<InstitutionProps[]> {
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
      .whereHas('group', (query) => query.where('userId', this.id))
      .firstOrFail();
  }

  public async getFundingPoolCategory(options?: ModelAdapterOptions): Promise<Category> {
    return await Category.query(options)
      .where('type', 'FUNDING POOL')
      .whereHas('group', (query) => query.where('userId', this.id))
      .firstOrFail();
  }
}
