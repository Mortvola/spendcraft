/* eslint-disable import/no-cycle */
import {
  BaseModel, BelongsTo, belongsTo, column, hasMany, HasMany,
} from '@ioc:Adonis/Lucid/Orm';
import Category from 'App/Models/Category';
import Application from 'App/Models/Application';

class Group extends BaseModel {
  @column()
  public id: number;

  @column()
  public name: string;

  @column()
  public type: string;

  @belongsTo(() => Application)
  public application: BelongsTo<typeof Application>;

  @column({ serializeAs: null })
  public applicationId: number;

  @column()
  public system: boolean;

  @column()
  public hidden: boolean;

  @hasMany(() => Category)
  public categories: HasMany<typeof Category>;
}

export default Group;
