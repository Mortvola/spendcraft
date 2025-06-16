import {
  BaseModel, column,
} from '@adonisjs/lucid/orm';
import { DateTime } from 'luxon';

class BalanceHistory extends BaseModel {
  @column()
  public id: number;

  @column()
  public accountId: number;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public balance: number;

  @column.date()
  public date: DateTime;
}

export default BalanceHistory;
