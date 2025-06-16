/* eslint-disable import/no-cycle */
import {
  BaseModel, column, belongsTo
} from '@adonisjs/lucid/orm'
// import TransactionCategory from 'App/Models/TransactionCategory';
import Loan from '#app/Models/Loan';
import { BelongsTo } from "@adonisjs/lucid/types/relations";

export default class LoanTransaction extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public loanId: number;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public principle: number;

  @column()
  public transactionCategoryId: number;

  // @belongsTo(() => TransactionCategory, {
  //   foreignKey: 'transactionCategoryId',
  //   localKey: 'id',
  // })
  // public transactionCategory: BelongsTo<typeof TransactionCategory>;

  @belongsTo(() => Loan)
  public loan: BelongsTo<typeof Loan>;
}
