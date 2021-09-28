/* eslint-disable import/no-cycle */
import {
  BaseModel, BelongsTo, belongsTo, column,
} from '@ioc:Adonis/Lucid/Orm';
import { DateTime } from 'luxon';
import Category from './Category';

class FundingPlanCategory extends BaseModel {
  @column()
  public id: number;

  @column({
    columnName: 'plan_id',
    serializeAs: null,
  })
  public fundingPlanId: number;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public amount: number;

  @column()
  public categoryId: number;

  @column()
  public planId: number;

  @column()
  public useGoal: boolean;

  @column()
  public goalDate: DateTime;

  @column()
  public recurrence: number;

  @belongsTo(() => Category)
  public category: BelongsTo<typeof Category>;
}

export default FundingPlanCategory;
