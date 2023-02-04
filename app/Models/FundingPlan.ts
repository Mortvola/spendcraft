/* eslint-disable import/no-cycle */
import { DateTime } from 'luxon';
import {
  BaseModel, BelongsTo, belongsTo, column, HasMany, hasMany,
} from '@ioc:Adonis/Lucid/Orm';
import FundingPlanCategory from 'App/Models/FundingPlanCategory';
import Budget from 'App/Models/Budget';
import CategoryHistoryItem from './CategoryHistoryItem';

export type PlanCategory = {
  id?: number,
  amount: number,
  categoryId: number,
};

export type Plan = {
  id: number,
  name: string,
  categories: FundingPlanCategory[],
  history: CategoryHistoryItem[],
};

export default class FundingPlan extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column.dateTime({ autoCreate: true, serializeAs: null })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime

  @column()
  public name: string;

  @column({ serializeAs: null, columnName: 'application_id' })
  public budgetId: number;

  @belongsTo(() => Budget)
  public budget: BelongsTo<typeof Budget>;

  @hasMany(() => FundingPlanCategory)
  public categories: HasMany<typeof FundingPlanCategory>

  // public async getFullPlan(this: FundingPlan, budget: Budget): Promise<Plan> {
  //   const categories = await this.related('categories').query();

  //   return {
  //     id: this.id,
  //     name: this.name,
  //     categories,
  //     history: await budget.history(),
  //   };
  // }
}
