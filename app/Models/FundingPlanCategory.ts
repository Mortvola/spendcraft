import { BaseModel, column } from '@ioc:Adonis/Lucid/Orm';

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

  static get Serializer(): string {
    return 'App/Serializer';
  }

  // eslint-disable-next-line class-methods-use-this
  getAmount(amount: string): number {
    return parseFloat(amount);
  }
}

export default FundingPlanCategory;
