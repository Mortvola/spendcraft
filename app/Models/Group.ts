import {
  BaseModel, BelongsTo, belongsTo, column,
} from '@ioc:Adonis/Lucid/Orm';
import User from 'App/Models/User';

class Group extends BaseModel {
  @column()
  public id: number;

  @column()
  public name: string;

  @belongsTo(() => User)
  public user: BelongsTo<typeof User>;

  @column({ serializeAs: null })
  public userId: number;

  @column()
  public system: boolean;
}

export default Group;
