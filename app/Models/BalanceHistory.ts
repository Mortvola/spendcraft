import {
  BaseModel, column,
} from '@ioc:Adonis/Lucid/Orm';
import { DateTime } from 'luxon';

class BalanceHistory extends BaseModel {
  @column()
  public id: number;

  @column()
  public accountId: number;

  @column()
  public balance: number;

  @column.date()
  public date: DateTime;
}

export default BalanceHistory;
