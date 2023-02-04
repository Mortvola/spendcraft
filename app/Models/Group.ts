/* eslint-disable import/no-cycle */
import {
  BaseModel, BelongsTo, belongsTo, column, hasMany, HasMany,
} from '@ioc:Adonis/Lucid/Orm';
import Category from 'App/Models/Category';
import Budget from 'App/Models/Budget';

class Group extends BaseModel {
  @column()
  public id: number;

  @column()
  public name: string;

  @column()
  public type: string;

  @belongsTo(() => Budget)
  public budget: BelongsTo<typeof Budget>;

  @column({ serializeAs: null, columnName: 'application_id' })
  public budgetId: number;

  @column()
  public system: boolean;

  @column()
  public hidden: boolean;

  @hasMany(() => Category)
  public categories: HasMany<typeof Category>;
}

export default Group;
