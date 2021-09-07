import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import User from 'App/Models/User';
import { TransactionType } from 'Common/ResponseTypes';

type NetworthReportType = (string | number)[][];
type PayeeReportType = Record<string, unknown>[];

class ReportController {
  // eslint-disable-next-line class-methods-use-this
  public async get({ request, auth: { user } }: HttpContextContract): Promise<NetworthReportType | PayeeReportType> {
    if (!user) {
      throw new Error('user not defined');
    }

    switch (request.params().report) {
      case 'networth':
        return ReportController.networth(user);

      case 'payee': {
        const {
          startDate,
          endDate,
          pc,
          a,
        } = request.qs();
        return ReportController.payee(user, startDate, endDate, pc, a);
      }

      case 'category': {
        const {
          startDate,
          endDate,
          c,
        } = request.qs();
        return ReportController.category(user, startDate, endDate, c);
      }

      default:
        throw new Error('unknown report request');
    }
  }

  private static async networth(user: User): Promise<NetworthReportType> {
    const listCategories = (categories: { name: string }[]): string => {
      let cats = '';

      categories.forEach((c) => {
        cats += `, "${c.name}" FLOAT`;
      });

      return cats;
    }

    const { days } = await Database.query()
      .select(Database.raw('current_date - min(date) as days'))
      .from((query) => {
        query.select(Database.raw('min(date) as date'))
          .from('balance_histories')
          .join('accounts', 'accounts.id', 'balance_histories.account_id')
          .join('institutions', 'institutions.id', 'accounts.institution_id')
          .where('user_id', user.id)
          .union((query2) => {
            query2.select(Database.raw('min(date) as date'))
              .from('account_transactions as at')
              .join('transactions as t', 't.id', 'at.transaction_id')
              .join('accounts as a', 'a.id', 'at.account_id')
              .join('institutions as i', 'i.id', 'a.institution_id')
              .where('i.user_id', user.id)
              .andWhere('a.tracking', '!=', 'Balances')
              .andWhereIn('t.type', [
                TransactionType.STARTING_BALANCE,
                TransactionType.REGULAR_TRANSACTION,
                TransactionType.MANUAL_TRANSACTION])
          })
          .as('union')
      })
      .first();

    let date = 'date::text'
    if (days > 10 * 365) {
      date = 'cast(date_trunc(\'year\', date) as date)';
    }
    else if (days > 2 * 365) {
      date = 'cast(date_trunc(\'month\', date) as date)';
    }
    else if (days > 0.5 * 365) {
      date = 'cast(date_trunc(\'week\', date) as date)';
    }

    const query = `
      select
        ${date} AS date,
        accounts.id || '_' || accounts.name AS name,
        max(CAST(hist.balance AS float)) AS balance
      from balance_histories AS hist
      join accounts ON accounts.id = hist.account_id
      join institutions ON institutions.id = accounts.institution_id
      where institutions.user_id = ${user.id}
      and accounts.tracking = 'Balances'
      group by ${date}, accounts.id
      union
      select
        date,
        id || '_' || name as name,
        sum(balance) over (partition by id order by id, date asc rows between unbounded preceding and current row) as balance
      from (
        select a.id, a.name, ${date} as date, sum(at.amount) as balance
        from account_transactions at
        join transactions t on t.id = at.transaction_id
        join accounts a on a.id = at.account_id
        join institutions i on i.id = a.institution_id
        where
          a.tracking != 'Balances'
          and t.type in (${[TransactionType.STARTING_BALANCE, TransactionType.REGULAR_TRANSACTION, TransactionType.MANUAL_TRANSACTION]}
          )
          and i.user_id = ${user.id}
        group by i.user_id, t.type, ${date}, a.id
      ) as daily
      order by date`;

    const categoryQuery = 'select accounts.id || \'_\' || accounts.name AS name '
    + 'from accounts '
    + 'join institutions ON institutions.id = accounts.institution_id '
    + `where institutions.user_id = ${user.id} `
    + 'order by name';

    const categories = await Database.rawQuery(categoryQuery);

    const crosstab = `SELECT * FROM crosstab($$${query}$$, $$${categoryQuery}$$) `
    + `AS (date TEXT ${listCategories(categories.rows)})`;

    const data = await Database.rawQuery(crosstab);

    // Move the data into the result object
    // Also, strip the account id off of the column names
    const result: (string | number)[][] = [['date'].concat(categories.rows
      .map((item) => item.name.replace(/\d+_/, '')))]
      .concat(data.rows.map((item) => Object.values(item)));

    // Fill in any gaps in balances
    for (let j = 1; j < result[1].length; j += 1) {
      if (result[1][j] === null) {
        result[1][j] = 0;
      }
    }

    for (let i = 2; i < result.length; i += 1) {
      for (let j = 1; j < result[i].length; j += 1) {
        if (result[i][j] === null) {
          result[i][j] = result[i - 1][j];
        }
      }
    }

    return result;
  }

  private static async payee(
    user: User,
    startDate: string,
    endDate: string,
    pc?: string[] | string,
    a?: string[] | string,
  ): Promise<PayeeReportType> {
    if (pc !== undefined && a !== undefined) {
      const paymentColumn = 'coalesce(payment_channel, \'unknown\')';

      const query = Database.query()
        .select(
          Database.raw('row_number() over (order by coalesce(at.merchant_name, at.name)) as "rowNumber"'),
          Database.raw('coalesce(at.merchant_name, at.name) as "name"'),
          Database.raw(`${paymentColumn} as "paymentChannel"`),
          Database.raw('CAST(count(*) as integer) as count'),
          Database.raw('CAST(sum(amount) as float) as sum'),
        )
        .from('account_transactions as at')
        .join('transactions', 'transactions.id', 'at.transaction_id')
        .join('accounts', 'accounts.id', 'account_id')
        .join('institutions', 'institutions.id', 'accounts.institution_id')
        .where('pending', false)
        .andWhereIn('transactions.type', [TransactionType.REGULAR_TRANSACTION, TransactionType.MANUAL_TRANSACTION])
        .andWhere('institutions.user_id', user.id)
        .groupBy(['payment_channel'])
        .groupByRaw('coalesce(at.merchant_name, at.name)')
        .orderByRaw('coalesce(at.merchant_name, at.name) asc')

      if (startDate) {
        query.andWhere('date', '>=', startDate);
      }

      if (endDate) {
        query.andWhere('date', '<=', endDate);
      }

      if (Array.isArray(pc)) {
        query.andWhereRaw(`${paymentColumn} in (${pc.map((p): string => {
          switch (p) {
            case 'instore': return '\'in store\'';
            case 'online': return '\'online\'';
            case 'other': return '\'other\'';
            default: return '\'unknown\'';
          }
        })})`);
      }
      else {
        query.andWhereRaw(`${paymentColumn} = ?`, [pc]);
      }

      if (Array.isArray(a)) {
        query.andWhereRaw(`accounts.id in (${a})`);
      }
      else {
        query.andWhereRaw('accounts.id = ?', [a]);
      }

      return query;
    }

    return [];
  }

  private static async category(
    user: User,
    startDate: string,
    endDate: string,
    c?: string[] | string,
  ): Promise<PayeeReportType> {
    if (c !== undefined) {
      const query = Database.query()
        .select(
          Database.raw('row_number() over (order by g.name, c.name) as "rowNumber"'),
          'g.name as groupName',
          'c.name as categoryName',
          Database.raw('CAST(sum(tc.amount) as float) as sum'),
          Database.raw('CAST(count(*) as integer) as count'),
        )
        .from('transaction_categories as tc')
        .join('categories as c', 'c.id', 'tc.category_id')
        .join('groups as g', 'g.id', 'c.group_id')
        .join('transactions as t', 't.id', 'tc.transaction_id')
        .where('g.user_id', user.id)
        .andWhereIn('t.type', [TransactionType.MANUAL_TRANSACTION, TransactionType.REGULAR_TRANSACTION])
        .groupBy(['g.name', 'c.name'])
        .orderBy('g.name', 'asc')
        .orderBy('c.name', 'asc');

      if (startDate) {
        query.andWhere('t.date', '>=', startDate);
      }

      if (endDate) {
        query.andWhere('t.date', '<=', endDate);
      }

      if (Array.isArray(c)) {
        query.andWhereRaw(`c.id in (${c})`);
      }
      else {
        query.andWhereRaw('c.id = ?', [c]);
      }

      return query;
    }

    return [];
  }
}

export default ReportController;
