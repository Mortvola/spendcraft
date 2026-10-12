import { HttpContext } from '@adonisjs/core/http';
import db from '@adonisjs/lucid/services/db';
import Budget from '#app/Models/Budget';
import Account from '#models/Account';
import Category from '#models/Category';
import { Exception } from '@adonisjs/core/exceptions';
import { type BudgetProgressReportResponse, AccountType, CategoryType, TrackingType, TransactionType } from '#common/ResponseTypes';
import { DateTime } from 'luxon';

type NetworthReportType = (string | number)[][];
type PayeeReportType = Record<string, unknown>[];
type IncomeVsExpensesReportType = [string, number, number, number][];
type FundingHistoryReportType = [string, number, number, number][];

function parseReportIds(value: unknown): number[] | undefined {
  if (value === undefined) return undefined;

  const values = Array.isArray(value) ? value : [value];
  const ids = values.map((item: unknown) => {
    if (typeof item !== 'string' || !/^\d+$/.test(item.trim())) {
      throw new Exception('Invalid report resource ID', { status: 422 });
    }

    const id = Number(item.trim());
    // Resource IDs are PostgreSQL integer columns.
    if (!Number.isSafeInteger(id) || id > 2147483647) {
      throw new Exception('Invalid report resource ID', { status: 422 });
    }
    return id;
  });

  return [...new Set(ids)];
}

class ReportController {
   
  public async get({
    request,
    auth: { user },
  }: HttpContext): Promise<NetworthReportType | PayeeReportType | BudgetProgressReportResponse> {
    if (!user) {
      throw new Error('user not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    switch (request.params().report) {
      case 'networth':
        return ReportController.networth(budget);

      case 'payee': {
        const {
          startDate,
          endDate,
          pc,
          a,
        } = request.qs();
        const accountIds = parseReportIds(a);
        for (const id of accountIds ?? []) {
          await Account.query().where('id', id)
            .whereHas('institution', (institution) => institution.where('budgetId', budget.id))
            .firstOrFail();
        }
        return ReportController.payee(budget, startDate, endDate, pc, accountIds);
      }

      case 'category': {
        const {
          startDate,
          endDate,
          c,
        } = request.qs();
        const categoryIds = parseReportIds(c);
        for (const id of categoryIds ?? []) {
          await Category.query().where('id', id)
            .whereHas('group', (group) => group.where('budgetId', budget.id))
            .firstOrFail();
        }
        return ReportController.category(budget, startDate, endDate, categoryIds);
      }

      case 'income-vs-expenses': {
        return ReportController.incomeVsExpenses(budget)
      }

      case 'funding-history': {
        return ReportController.fundingHistory(budget)
      }

      case 'budget-progress': {
        const {
          m,
        } = request.qs();
        const startDate = DateTime.fromFormat(`1-${m}`, 'd-M-yyyy');
        const endDate = startDate.endOf('month');
        return ReportController.budgetProgress(budget, startDate, endDate);
      }

      default:
        throw new Error('unknown report request');
    }
  }

  private static async networth(budget: Budget): Promise<NetworthReportType> {
    const listCategories = (categories: { name: string }[]): string => (
      categories.map((_, index) => `, account_${index} FLOAT`).join('')
    );

    const { days } = await db.query()
      .select(db.raw('current_date - min(date) as days'))
      .from((query) => {
        query.select(db.raw('min(statements.start_date) as date'))
          .from('statements')
          .join('accounts', 'accounts.id', 'statements.account_id')
          .join('institutions', 'institutions.id', 'accounts.institution_id')
          .where('institutions.application_id', budget.id)
          .andWhere('accounts.closed', false)
          .andWhere('accounts.tracking', TrackingType.Balances)
          .union((query2) => {
            query2.select(db.raw('min(case when t.type = ? and a.tracking = ? and a.type != ? then a.start_date else t.date end) as date', [TransactionType.STARTING_BALANCE, TrackingType.Transactions, AccountType.Loan]))
              .from('account_transactions as at')
              .join('transactions as t', 't.id', 'at.transaction_id')
              .join('accounts as a', 'a.id', 'at.account_id')
              .join('institutions as i', 'i.id', 'a.institution_id')
              .where('i.application_id', budget.id)
              .andWhere('a.closed', false)
              .andWhere('a.tracking', '!=', TrackingType.Balances)
              .andWhereIn('t.type', [
                TransactionType.STARTING_BALANCE,
                TransactionType.REGULAR_TRANSACTION,
                TransactionType.MANUAL_TRANSACTION])
              .andWhere((meaningful) => {
                meaningful.whereNot('t.type', TransactionType.STARTING_BALANCE).orWhereNot('at.amount', 0)
              })
          })
          .as('union')
      })
      .first();

    let date = 'date::text'
    let date2 = 'end_date::text'
    if (days > 10 * 365) {
      date = 'cast(date_trunc(\'year\', date) as date)';
      date2 = 'cast(date_trunc(\'year\', end_date) as date)';
    }
    else if (days > 2 * 365) {
      date = 'cast(date_trunc(\'month\', date) as date)';
      date2 = 'cast(date_trunc(\'month\', end_date) as date)';
    }
    else if (days > 0.5 * 365) {
      date = 'cast(date_trunc(\'week\', date) as date)';
      date2 = 'cast(date_trunc(\'week\', end_date) as date)';
    }

    const query =  `
      WITH openings AS (
        SELECT a.id, a.name, a.start_date, at.amount AS opening
        FROM accounts a
        JOIN institutions i ON i.id = a.institution_id
        JOIN account_transactions at ON at.account_id = a.id
        JOIN transactions t ON t.id = at.transaction_id
        WHERE i.application_id = ${budget.id}
          AND a.tracking = '${TrackingType.Transactions}' AND a.type != '${AccountType.Loan}'
          AND t.type = ${TransactionType.STARTING_BALANCE} AND t.deleted = false AND at.pending = false
      ), opening_events AS (
        SELECT id, name, start_date AS date, opening, 0::numeric AS movement
        FROM openings WHERE opening != 0
        UNION ALL
        SELECT o.id, o.name, t.date, o.opening, at.amount
        FROM openings o
        JOIN account_transactions at ON at.account_id = o.id
        JOIN transactions t ON t.id = at.transaction_id
        WHERE t.type IN (${[TransactionType.REGULAR_TRANSACTION, TransactionType.MANUAL_TRANSACTION]})
          AND t.date >= o.start_date AND t.deleted = false AND at.pending = false
      ), opening_buckets AS (
        SELECT id, name, ${date} AS date, opening, sum(movement) AS movement
        FROM opening_events GROUP BY id, name, ${date}, opening
      )
      select
        ${date2} AS date,
        accounts.id || '_' || accounts.name AS name,
        max(CAST(hist.ending_balance AS float)) AS balance
      from statements AS hist
      join accounts ON accounts.id = hist.account_id
      join institutions ON institutions.id = accounts.institution_id
      where institutions.application_id = ${budget.id}
      and accounts.tracking = 'Balances'
      group by ${date2}, accounts.id
      union
      select
        date,
        id || '_' || name as name,
        balance - COALESCE(sum(trans_sum) over (partition by id order by id, date desc rows between unbounded preceding and 1 preceding), 0) as balance
      from (
        select a.id, a.name, ${date} as date, sum(at.amount) as trans_sum, a.balance
        from account_transactions at
        join transactions t on t.id = at.transaction_id
        join accounts a on a.id = at.account_id
        join institutions i on i.id = a.institution_id
        where
          a.tracking != 'Balances'
          and NOT EXISTS (SELECT 1 FROM openings o WHERE o.id = a.id)
          and t.type in (${[TransactionType.REGULAR_TRANSACTION, TransactionType.MANUAL_TRANSACTION]})
          and i.application_id = ${budget.id}
          and at.pending = false
          and t.deleted = false
        group by i.application_id, t.type, ${date}, a.id
      ) as daily
      union
      SELECT date, id || '_' || name AS name,
        opening + sum(movement) OVER (PARTITION BY id ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
      FROM opening_buckets
      order by date`;

    const categoryQuery = 'select accounts.id || \'_\' || accounts.name AS name '
      + 'from accounts '
      + 'join institutions ON institutions.id = accounts.institution_id '
      + `where institutions.application_id = ${budget.id} `
      + 'order by name';

    const categories: { rows: { name: string }[] } = await db.rawQuery(categoryQuery);

    if (categories.rows.length === 0) return [['date']];

    const crosstab = `SELECT * FROM crosstab($$${query}$$, $$${categoryQuery}$$) `
    + `AS (date TEXT ${listCategories(categories.rows)})`;

    const data: { rows: object[] } = await db.rawQuery(crosstab);

    // Move the data into the result object
    // Also, strip the account id off of the column names
    const result: (string | number)[][] = [
      ['date'].concat(categories.rows
        .map((item) => item.name.replace(/\d+_/, '')))
    ]
      .concat(data.rows.map((item) => Object.values(item)));

    if (result.length === 1) return result;

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
    budget: Budget,
    startDate: string,
    endDate: string,
    pc?: string[] | string,
    a?: number[],
  ): Promise<PayeeReportType> {
    if (pc !== undefined && a !== undefined && a.length > 0) {
      const paymentColumn = 'coalesce(payment_channel, \'unknown\')';

      const query = db.query()
        .select(
          db.raw('row_number() over (order by coalesce(at.merchant_name, at.name)) as "rowNumber"'),
          db.raw('coalesce(at.merchant_name, at.name) as "name"'),
          db.raw(`${paymentColumn} as "paymentChannel"`),
          db.raw('CAST(count(*) as integer) as count'),
          db.raw('CAST(sum(amount) as float) as sum'),
        )
        .from('account_transactions as at')
        .join('transactions', 'transactions.id', 'at.transaction_id')
        .join('accounts', 'accounts.id', 'account_id')
        .join('institutions', 'institutions.id', 'accounts.institution_id')
        .where('pending', false)
        .andWhere('accounts.closed', false)
        .andWhereIn('transactions.type', [TransactionType.REGULAR_TRANSACTION, TransactionType.MANUAL_TRANSACTION])
        .andWhere('institutions.application_id', budget.id)
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

      query.whereIn('accounts.id', a);

      return query;
    }

    return [];
  }

  private static async category(
    budget: Budget,
    startDate: string,
    endDate: string,
    c?: number[],
  ): Promise<PayeeReportType> {
    if (c !== undefined && c.length > 0) {
      const query = db.query()
        .select(
          db.raw('row_number() over (order by g.name, c.name) as "rowNumber"'),
          'g.name as groupName',
          'c.name as categoryName',
          db.raw('CAST(sum(tc.amount) as float) as sum'),
          db.raw('CAST(count(*) as integer) as count'),
        )
        .from('transaction_categories as tc')
        .join('categories as c', 'c.id', 'tc.category_id')
        .join('groups as g', 'g.id', 'c.group_id')
        .join('transactions as t', 't.id', 'tc.transaction_id')
        .where('g.application_id', budget.id)
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

      query.whereIn('c.id', c);

      return query;
    }

    return [];
  }

  private static async incomeVsExpenses(
    budget: Budget,
  ): Promise<IncomeVsExpensesReportType> {
    const acctTransfer = await budget.getAccountTransferCategory();

    const query = await db.query()
      .select(
        db.raw(
          'date_part(\'year\', date) || '
          + '\'-\' || lpad(cast(date_part(\'month\', date) as varchar), 2, \'0\') as month',
        ),
        // The tc.amount is for removing any amount that was an account transfer
        db.raw('sum(CASE WHEN at.amount >= 0 THEN at.amount - COALESCE(tc.amount, 0) ELSE 0 END) as income'),
        db.raw('sum(CASE WHEN at.amount < 0 THEN at.amount - COALESCE(tc.amount, 0) ELSE 0 END) as expenses'),
      )
      .from('transactions as t')
      .join('account_transactions as at', 'at.transaction_id', 't.id')
      .join('accounts as a', 'a.id', 'at.account_id')
      .leftJoin('transaction_categories as tc', (q) => {
        q.on('tc.transaction_id', 't.id')
          .andOnVal('category_id', '=', acctTransfer.id)
      })
      .where('t.application_id', budget.id)
      .andWhere('a.tracking', TrackingType.Transactions)
      .andWhere('t.type', '!=', TransactionType.STARTING_BALANCE)
      .groupByRaw('date_part(\'year\', date) || \'-\' || lpad(cast(date_part(\'month\', date) as varchar), 2, \'0\')')
      .orderBy('month', 'asc');

    return query.map((row) => [
      row.month,
      parseFloat(row.income),
      parseFloat(row.expenses),
      parseFloat(row.income) + parseFloat(row.expenses),
    ]);
  }

  private static async fundingHistory(
    budget: Budget,
  ): Promise<FundingHistoryReportType> {
    const query = await db.query()
      .select(
        'g.id as groupId',
        'g.name as groupName',
        'g.type as groupType',
        'c.id as categoryId',
        'c.name as categoryName',
        db.raw(`(
          select json_agg(monthly_amount)
          from (
            select 
              json_build_object(
                'year', EXTRACT(YEAR FROM t.date),
                'month', EXTRACT(MONTH FROM t.date),
                'amount', sum(tc.amount)) AS monthly_amount
            from transaction_categories AS tc
            join transactions as t on t.id = tc.transaction_id and t.type = 2
            where tc.category_id = c.id
            group by EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date)
          ) as amounts
        ) as history`),
      )
      .from('categories AS c')
      .join('groups as g', 'g.id', 'c.group_id')
      .where('c.type', '!=', CategoryType.FundingPool)
      .andWhere('g.application_id', budget.id)
      .orderBy('g.name')
      .orderBy('c.name');

    return query;
  }

  private static async budgetProgress(
    budget: Budget,
    startDate: DateTime,
    endDate: DateTime,
  ): Promise<BudgetProgressReportResponse> {
    const acctTransfer = await budget.getAccountTransferCategory();

    const fundingQuery = await db.query()
      .select(
        db.raw('sum(tc.amount) AS amount'),
      )
      .from('transaction_categories AS tc')
      .join('transactions AS t', 't.id', 'tc.transaction_id')
      .join('categories AS c', 'c.id', 'tc.category_id')
      .where('t.application_id', budget.id)
      .whereBetween('t.date', [startDate.toISODate() ?? '', endDate.toISODate() ?? ''])
      .andWhere('tc.category_id', '!=', acctTransfer.id)
      .andWhere('t.type', '=', TransactionType.FUNDING_TRANSACTION)
      .andWhere('c.monthly_expenses', true);

    const fundingAmount = parseFloat(fundingQuery[0].amount);

    const query = await db.query()
      .select(
        db.raw('to_char(t.date, \'YYYY-MM-DD\') as date'),
        db.raw('sum(tc.amount) AS amount'),
        db.raw('array_agg(t.id) as transactions'),
      )
      .from('transaction_categories AS tc')
      .join('transactions AS t', 't.id', 'tc.transaction_id')
      .join('categories AS c', 'c.id', 'tc.category_id')
      .where('t.application_id', budget.id)
      .whereBetween('t.date', [startDate.toISODate() ?? '', endDate.toISODate() ?? ''])
      .andWhere('tc.category_id', '!=', acctTransfer.id)
      .andWhereNotIn('t.type', [
        TransactionType.FUNDING_TRANSACTION,
        TransactionType.REBALANCE_TRANSACTION,
        TransactionType.STARTING_BALANCE,
      ])
      .andWhere('c.monthly_expenses', true)
      .groupBy('t.date')
      .orderBy('t.date', 'asc');

    let runningBalance = fundingAmount;

    return query.map((row) => {
      runningBalance += parseFloat(row.amount);

      return [row.date, runningBalance, row.transactions];
    });
  }
}

export default ReportController;
