import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import User from 'App/Models/User';
import Institution from 'App/Models/Institution';
import AccountTransaction from 'App/Models/AccountTransaction';

type Category = {
  name: string,
};

type NetworthReportType = (string | number)[][];
type PayeeReportType = (Institution | AccountTransaction)[];

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
        const { startDate, endDate } = request.qs();
        return ReportController.payee(user, startDate, endDate);
      }

      default:
        throw new Error('unknown report request');
    }
  }

  static listCategories(categories: Array<Category>): string {
    let cats = '';

    categories.forEach((c) => {
      cats += `, "${c.name}" FLOAT`;
    });

    return cats;
  }

  private static async networth(user: User): Promise<NetworthReportType> {
    const query = 'select '
    + 'date::text, accounts.id || \'_\' || accounts.name AS name, CAST(hist.balance AS float) AS balance '
    + 'from balance_histories AS hist '
    + 'join accounts ON accounts.id = hist.account_id '
    + 'join institutions ON institutions.id = accounts.institution_id '
    + `where institutions.user_id = ${user.id} `
    + 'order by date';

    const categoryQuery = 'select accounts.id || \'_\' || accounts.name AS name '
    + 'from accounts '
    + 'join institutions ON institutions.id = accounts.institution_id '
    + `where institutions.user_id = ${user.id} `
    + 'order by name';

    const categories = await Database.rawQuery(categoryQuery);

    const crosstab = `SELECT * FROM crosstab($$${query}$$, $$${categoryQuery}$$) `
    + `AS (date TEXT ${ReportController.listCategories(categories.rows)})`;

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

  private static async payee(user: User, startDate: string, endDate: string): Promise<PayeeReportType> {
    // return AccountTransaction.query()
    //   .preload('transaction')
    //   .preload('account', (accountQuery) => {
    //     accountQuery.preload('institution');
    //   })
    //   .whereHas('transaction', (transactionQuery) => {
    //     transactionQuery.where('date', '<=', '2020-09-05')
    //   })
    //   .whereHas('account', (accountQuery) => {
    //     accountQuery.whereHas('institution', (institutionQuery) => {
    //       institutionQuery.where('userId', user.id)
    //     })
    //   })
    // return user.related('institutions').query()
    //   .preload('accounts', (accountQuery) => {
    //     accountQuery.preload('accountTransactions', (accountTransactionQuery) => {
    //       accountTransactionQuery.preload('transaction')
    //     })
    //   })
    //   .withAggregate('accounts', (q) => {
    //     q.count('*').as('count')
    //       .withAggregate('accountTransactions', (q2) => {
    //         q2.count('*').as('count')
    //       })
    //   })
    //   .whereHas('accounts', (accountQuery) => {
    //     accountQuery.whereHas('accountTransactions', (accountTransactionQuery) => {
    //       accountTransactionQuery.where('date', '<=', '2020-09-05')
    //     })
    //   })
    return Database.query()
      .select(
        Database.raw('row_number() over (order by account_transactions.name) as "rowNumber"'),
        'account_transactions.name',
        'mask',
        'payment_channel',
        Database.raw('count(*)'),
      )
      .from('account_transactions')
      .join('transactions', 'transactions.id', 'account_transactions.transaction_id')
      .join('accounts', 'accounts.id', 'account_id')
      .join('institutions', 'institutions.id', 'accounts.institution_id')
      .where('pending', false)
      .andWhere('date', '>=', startDate)
      .andWhere('institutions.user_id', user.id)
      .groupBy(['account_transactions.name', 'mask', 'payment_channel'])
      .orderBy('account_transactions.name', 'asc');
    // select i.user_id, at.name, a.mask, at.payment_channel, count(*)
    // from account_transactions at
    // join transactions t on t.id = at.transaction_id
    // join accounts a on a.id = at.account_id
    // join institutions i on i.id = a.institution_id
    // where at.pending = false and t.date > '2020-09-05'
    // and a.id = 180
    // group by i.user_id, at.name, a.mask, at.payment_channel order by at.name, a.mask
  }
}

export default ReportController;
