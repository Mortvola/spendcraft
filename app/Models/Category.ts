import {
  BaseModel, BelongsTo, belongsTo, column, HasMany, hasMany,
} from '@ioc:Adonis/Lucid/Orm';
import Database from '@ioc:Adonis/Lucid/Database';
import Group from 'App/Models/Group';
import { CategoryType } from 'Common/ResponseTypes';
import TransactionCategory from 'App/Models/TransactionCategory';

type CategoryItem = {
  id: number,
  name: string,
  type: string,
  balance: number,
};

type GroupItem = {
  id: number,
  name: string,
  system: boolean,
  categories: (CategoryItem | { id: number, name: string})[],
};

class Category extends BaseModel {
  @column()
  public id: number;

  @belongsTo(() => Group)
  public group: BelongsTo<typeof Group>;

  @column()
  public name: string;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public amount: number;

  @column()
  public type: CategoryType;

  @column({
    serializeAs: 'groupId',
  })
  public groupId: number;

  @hasMany(() => TransactionCategory)
  public transactionCategory: HasMany<typeof TransactionCategory>;

  public static async balances(
    userId: number,
    date: string,
    transactionId: number,
  ): Promise<GroupItem[]> {
    let transactionsSubquery = `
      select category_id, splits.amount
      from transaction_categories AS splits
      join transactions ON transactions.id = splits.transaction_id
      where transactions.date > '${date}'
      and transactions.user_id = ${userId}
    `;

    // Also subtract out the transaction identified by transactionId
    if (transactionId !== undefined) {
      transactionsSubquery += `or transactions.id = ${transactionId}`;
    }

    const rows = await Database.query()
      .select(
        'groups.id AS groupId',
        'groups.name AS groupName',
        'groups.system as groupSystem',
        'categories.id as categoryId',
        'categories.name as categoryName',
        'categories.type as categoryType',
        Database.raw('categories.amount - COALESCE(sum(splits1.amount), 0) AS balance'),
      )
      .from('groups')
      .join('categories', 'categories.group_id', 'groups.id')
      .joinRaw(`left join (${transactionsSubquery}) as splits1 ON  splits1.category_id  = categories.id`)
      .where('groups.user_id', userId)
      .groupBy('groups.id', 'groups.name', 'categories.id', 'categories.name')
      .orderBy('groups.name')
      .orderBy('categories.name');

    const groups: Array<GroupItem> = [];
    let group: GroupItem | null = null;

    // Convert array to tree form
    rows.forEach((cat) => {
      if (!group) {
        group = {
          id: cat.groupId,
          name: cat.groupName,
          system: cat.groupSysetem,
          categories: [],
        };
      }
      else if (group.name !== cat.groupName) {
        groups.push(group);
        group = {
          id: cat.groupId,
          name: cat.groupName,
          system: cat.groupSysetem,
          categories: [],
        };
      }

      if (group && cat.categoryId) {
        group.categories.push({
          id: cat.categoryId,
          name: cat.categoryName,
          balance: parseFloat(cat.balance),
          type: cat.categoryType,
        });
      }
    });

    if (group) {
      groups.push(group);
    }

    return groups;
  }
}

export default Category;
export { GroupItem, CategoryItem };
