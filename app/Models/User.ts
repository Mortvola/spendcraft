/* eslint-disable import/no-cycle */
import { DateTime } from 'luxon';
import Hash from '@ioc:Adonis/Core/Hash'
import {
  column,
  beforeSave,
  BaseModel,
  belongsTo,
  BelongsTo,
} from '@ioc:Adonis/Lucid/Orm';
import Application from './Application';

export default class User extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public username: string;

  @column()
  public email: string

  @column({ serializeAs: null })
  public password: string

  @column()
  public activated: boolean;

  @column()
  public rememberMeToken?: string

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @beforeSave()
  public static async hashPassword(user: User): Promise<void> {
    if (user.$dirty.password) {
      user.password = await Hash.make(user.password);
    }
  }

  @belongsTo(() => Application)
  public application: BelongsTo<typeof Application>;

  @column()
  public applicationId: number;
}
