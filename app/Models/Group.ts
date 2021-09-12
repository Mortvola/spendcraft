/* eslint-disable import/no-cycle */
import {
  BaseModel, BelongsTo, belongsTo, column, hasMany, HasMany,
} from '@ioc:Adonis/Lucid/Orm';
import User from 'App/Models/User';
import Category from 'App/Models/Category';

class Group extends BaseModel {
  @column()
  public id: number;

  @column()
  public name: string;

  @column()
  public type: string;

  @belongsTo(() => User)
  public user: BelongsTo<typeof User>;

  @column({ serializeAs: null })
  public userId: number;

  @column()
  public system: boolean;

  @hasMany(() => Category)
  public categories: HasMany<typeof Category>;
}

export default Group;
