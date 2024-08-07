/* eslint-disable import/no-cycle */
import {
  BaseModel, column, belongsTo, BelongsTo,
} from '@ioc:Adonis/Lucid/Orm'
// import TransactionCategory from 'App/Models/TransactionCategory';
import Loan from 'App/Models/Loan';

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
