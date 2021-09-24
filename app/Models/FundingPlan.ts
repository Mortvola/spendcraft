/* eslint-disable import/no-cycle */
import { DateTime } from 'luxon';
import {
  BaseModel, BelongsTo, belongsTo, column, HasMany, hasMany,
} from '@ioc:Adonis/Lucid/Orm';
import FundingPlanCategory from 'App/Models/FundingPlanCategory';
import { GroupHistoryItem } from 'App/Models/GroupHistoryItem';
import Application from 'App/Models/Application';

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
  public applicationId: number;

  @belongsTo(() => Application)
  public application: BelongsTo<typeof Application>;

  @hasMany(() => FundingPlanCategory)
  public categories: HasMany<typeof FundingPlanCategory>

  public async getFullPlan(this: FundingPlan, application: Application): Promise<Plan> {
    const categories = await this.related('categories').query();

    return {
      id: this.id,
      name: this.name,
      categories,
      history: await application.history(),
    };
  }
}
