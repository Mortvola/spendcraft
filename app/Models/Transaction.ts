/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, column,
  belongsTo, hasOne,
} from '@adonisjs/lucid/orm';
import { DateTime } from 'luxon';
import AccountTransaction from '#app/Models/AccountTransaction';
import { TransactionType } from '#common/ResponseTypes';
import Budget from '#app/Models/Budget';
import TransactionLog from './TransactionLog';
import { HasMany } from "@adonisjs/lucid/types/relations";
import { BelongsTo } from "@adonisjs/lucid/types/relations";
import { HasOne } from "@adonisjs/lucid/types/relations";

export type TransCategory = {
  categoryId: number,
  amount: number,
  comment?: string,
}

class Transaction extends BaseModel {
  @column()
  public id: number;

  @column.dateTime({ serializeAs: null })
  public createdAt: DateTime;

  @column.date()
  public date: DateTime;

  @column()
  public sortOrder: number;

  @column()
  public type: TransactionType;

  @hasOne(() => AccountTransaction)
  public accountTransaction: HasOne<typeof AccountTransaction>

  @belongsTo(() => Budget)
  public budget: BelongsTo<typeof Budget>;

  @column({ serializeAs: null, columnName: 'application_id' })
  public budgetId: number;

  @column()
  public comment: string;

  @column({ serializeAs: null })
  public deleted: boolean;

  @column()
  public duplicateOfTransactionId: number | null;

  @column({
    prepare: (value: TransCategory[]) => JSON.stringify(value),
  })
  public categories: TransCategory[];

  @column()
  public version: number;

  @hasMany(() => TransactionLog)
  public transactionLog: HasMany<typeof TransactionLog>;
}

export default Transaction;
