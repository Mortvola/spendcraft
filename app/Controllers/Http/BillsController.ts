import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Bill from 'App/Models/Bill';
import { DateTime } from 'luxon';
import { getGoalDate } from './transactionFields';

export default class BillsController {
  // eslint-disable-next-line class-methods-use-this
  public async get(context: HttpContextContract): Promise<Bill[]> {
    const bills = await Bill.all();

    // eslint-disable-next-line no-restricted-syntax
    for (const b of bills) {
      b.dueDate = getGoalDate(b.dueDate, b.recurrence) ?? DateTime.now()
    }

    bills.sort((a, b) => (a.dueDate && b.dueDate ? a.dueDate.diff(b.dueDate, 'days').days : 0))

    return bills;
  }
}
