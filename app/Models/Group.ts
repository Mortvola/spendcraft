import {
  BaseModel, belongsTo, column, hasMany
} from '@adonisjs/lucid/orm';
import Category from '#app/Models/Category';
import Budget from '#app/Models/Budget';
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

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
  public hidden: boolean;

  @column()
  public parentGroupId: number | null;

  @hasMany(() => Category)
  public categories: HasMany<typeof Category>;
}

export default Group;
