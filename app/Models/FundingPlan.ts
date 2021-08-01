import Database from '@ioc:Adonis/Lucid/Database';
import { DateTime } from 'luxon';
import {
  BaseModel, BelongsTo, belongsTo, column,
} from '@ioc:Adonis/Lucid/Orm';
import User, { GroupHistoryItem } from 'App/Models/User';

export type PlanCategory = {
  id?: number,
  amount: number,
  name?: string,
  categoryId: number,
};

type PlanGroup = {
  id: number,
  name: string,
  system: boolean,
  categories: Array<PlanCategory>,
}

export type Plan = {
  id: number,
  name: string,
  total: number,
  groups: Array<PlanGroup>,
  history: Array<GroupHistoryItem>,
};

export default class FundingPlan extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column()
  public name: string;

  @column()
  public userId: number;

  @belongsTo(() => User)
  public user: BelongsTo<typeof User>;

  public async getFullPlan(this: FundingPlan, user: User): Promise<Plan> {
    const cats = await Database.query()
      .select(
        'fpc.id AS id',
        'cats.group_id AS groupId',
        'groups.name AS groupName',
        'groups.system as groupSystem',
        'cats.id AS categoryId',
        'cats.name AS categoryName',
        'cats.type AS categoryType',
        Database.raw('CAST(COALESCE(fpc.amount, 0) AS float) AS amount'),
      )
      .from('categories AS cats')
      .join('groups', 'groups.id', 'cats.group_id')
      .leftJoin('funding_plan_categories AS fpc',
        'fpc.category_id',
        Database.raw(`cats.id AND fpc.plan_id = ${this.id}`))
      .where('groups.user_id', user.id)
      .andWhere((query) => {
        query
          .where('fpc.plan_id', this.id)
          .orWhereNull('fpc.plan_id');
      })
      .orderBy('groups.name')
      .orderBy('cats.name');

    const groups: Array<PlanGroup> = [];
    let currentGroupName = null;
    let total = 0;

    cats.forEach((c) => {
      if (c.groupName !== currentGroupName) {
        groups.push({
          id: c.groupId,
          name: c.groupName,
          system: c.groupSystem,
          categories: [],
        });
        currentGroupName = c.groupName;
      }

      groups[groups.length - 1].categories.push({
        id: c.categoryId,
        name: c.categoryName,
        categoryId: c.categoryId,
        amount: c.amount,
      });

      total += c.amount;
    });

    return {
      id: this.id,
      name: this.name,
      total,
      groups,
      history: await user.history(),
    };
  }
}
