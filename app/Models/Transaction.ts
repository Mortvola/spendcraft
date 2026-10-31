import { serializeFundingMetadata,
  type TransactionFundingMetadata } from '#services/fundingAmountCodec';
import { encodeTaxAttributions } from '#services/taxAmountCodec';
import { encodeCategoryAllocations,
  type CentCategoryAllocation } from '#services/categoryAmountCodec';
import { bindTaxStorage, prepareTaxStorageSave } from '#services/transactionTaxStorage';
import { prepareTaxStorage, finishTaxStorageSave } from '#services/taxStorageBinding';
import { prepareCategoryStorage, finishCategoryStorageSave } from
  '#services/categoryStorageBinding';
import { bindCategoryStorage, prepareNewCategoryStorage } from
  '#services/transactionCategoryStorage';
import {
  BaseModel, hasMany, column, afterFind, afterFetch, beforeSave, afterSave,
  belongsTo, hasOne,
} from '@adonisjs/lucid/orm';
import { DateTime } from 'luxon';
import AccountTransaction from '#app/Models/AccountTransaction';
import { TransactionType } from '#common/ResponseTypes';
import Budget from '#app/Models/Budget';
import TransactionLog from './TransactionLog.js';
import type { HasMany, BelongsTo, HasOne } from "@adonisjs/lucid/types/relations";

interface TransCategory extends CentCategoryAllocation, TransactionFundingMetadata {
  comment?: string,
}

interface TransTaxCategory {
  type: string,
  amount: number,
}

class Transaction extends BaseModel {
  @afterFind()
  public static async bindActiveCategories(transaction: Transaction) {
    await bindCategoryStorage([transaction]);
    await bindTaxStorage([transaction]);
  }

  @afterFetch()
  public static async bindActiveCategoryList(transactions: Transaction[]) {
    await bindCategoryStorage(transactions);
    await bindTaxStorage(transactions);
  }

  @beforeSave()
  public static async encodeActiveCategories(transaction: Transaction) {
    await prepareNewCategoryStorage(transaction);
    await prepareTaxStorageSave(transaction);
  }

  @afterSave()
  public static finishActiveCategories(transaction: Transaction) {
    finishCategoryStorageSave(transaction);
    finishTaxStorageSave(transaction);
  }

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: null })
  public updatedAt: DateTime;

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
    prepare: (value: TransCategory[], _attribute, model) => prepareCategoryStorage(value, model),
    serialize: (value) => value === null ? null : serializeFundingMetadata(
      encodeCategoryAllocations(value)),
  })
  public categories: TransCategory[];

  @column({
    prepare: (value: TransTaxCategory[], _attribute, model) => prepareTaxStorage(value, model),
    serialize: (value) => value === null || value === undefined ? value : encodeTaxAttributions(
      value),
  })
  public taxes: TransTaxCategory[];

  @column()
  public version: number;

  @hasMany(() => TransactionLog)
  public transactionLog: HasMany<typeof TransactionLog>;
}

export default Transaction;
