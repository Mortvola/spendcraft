/* eslint-disable import/no-cycle */
import { DateTime } from 'luxon';
import {
  BaseModel, BelongsTo, belongsTo, column, HasMany, hasMany,
} from '@ioc:Adonis/Lucid/Orm';
import User, { GroupHistoryItem } from 'App/Models/User';
import FundingPlanCategory from './FundingPlanCategory';

export type PlanCategory = {
  id?: number,
  amount: number,
  name?: string,
  categoryId: number,
};

export type Plan = {
  id: number,
  name: string,
  categories: FundingPlanCategory[],
  history: GroupHistoryItem[],
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

  @hasMany(() => FundingPlanCategory)
  public categories: HasMany<typeof FundingPlanCategory>

  public async getFullPlan(this: FundingPlan, user: User): Promise<Plan> {
    const categories = await this.related('categories').query();

    return {
      id: this.id,
      name: this.name,
      categories,
      history: await user.history(),
    };
  }
}
