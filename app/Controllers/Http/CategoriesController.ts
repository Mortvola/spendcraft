import db from '@adonisjs/lucid/services/db';
import { HttpContext } from '@adonisjs/core/http';
import Category, { GroupItem } from '#app/Models/Category';
import CategoryTransfer from '#app/Models/CategoryTransfer';
import UpdateCategoryTransferValidator from '#app/validation/Validators/UpdateCategoryTransferValidator';
import Transaction from '#app/Models/Transaction';
import Loan from '#app/Models/Loan';
import {
  CategoryBalanceProps,
  TransactionsResponse,
  TransactionProps, TransactionType, FundingInfoProps,
  ApiResponse,
  BillProps,
  GroupType,
  CategoryType,
} from '#common/ResponseTypes';
import Group from '#app/Models/Group';
import { DateTime } from 'luxon';
import transactionFields from './transactionFields.js';
import { addCategory, addGroup, deleteCategory, deleteGroup, updateCategory, updateGroup } from '#app/validation/Validators/category';

class CategoriesController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    request,
    auth: { user },
  }: HttpContext): Promise<ApiResponse<{ groups: Group[], categories: Category[] } | FundingInfoProps[]>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const { date } = request.qs();

    if (date) {
      // Get the first day of the month
      const firstDayOfMonth = DateTime.fromISO(date)
        .set({
          day: 1, hour: 0, minute: 0, second: 0, millisecond: 0,
        })

      // Get the date of the first day of the previous month.
      const firstDayOfPreviousMonth = firstDayOfMonth
        .minus({ days: 1 })
        .set({
          day: 1, hour: 0, minute: 0, second: 0, millisecond: 0,
        })

      const categories = await Category.query()
        .whereHas('group', (query) => {
          query.where('budgetId', budget.id)
        })
        // Get the sum of the transactions since the first of the month.
        // .withAggregate('transactionCategory', (query) => {
        //   query.sum('amount').as('sum')
        //     .whereHas('transaction', (transQuery) => {
        //       transQuery.where('date', '>=', firstDayOfMonth.toISODate() ?? '')
        //     })
        // })
        .joinRaw(`left outer join
          (
            select transCats."categoryId", sum(transCats.amount) as sum
            from transactions t
            cross join lateral jsonb_to_recordset(t.categories) as transCats("categoryId" int, amount decimal)
            where t.date >= ?
            and t.deleted = false
            group by transCats."categoryId"
          ) AS T1 on T1."categoryId" = categories.id
        `, [firstDayOfMonth.toISODate() ?? ''])
        // Get the sum of the transactions (minus funding and category transfers) from the prrevious month
        // .withAggregate('transactionCategory', (query) => {
        //   query.sum('amount').as('previousSum')
        //     .whereHas('transaction', (transQuery) => {
        //       transQuery.where('date', '<', firstDayOfMonth.toISODate() ?? '')
        //         .andWhere('date', '>=', firstDayOfPreviousMonth.toISODate() ?? '')
        //         .andWhereNotIn('type', [TransactionType.FUNDING_TRANSACTION, TransactionType.REBALANCE_TRANSACTION])
        //     })
        // })
        .joinRaw(`left outer join
          (
            select transCats."categoryId", sum(transCats.amount) as "previousSum"
            from transactions t
            cross join lateral jsonb_to_recordset(t.categories) as transCats("categoryId" int, amount decimal)
            where t.date < ?
            and t.date >= ?
            and t.deleted = false
            and t.type NOT IN (?, ?)
            group by transCats."categoryId"
          ) AS T2 on T2."categoryId" = categories.id
        `, [
          firstDayOfMonth.toISODate() ?? '',
          firstDayOfPreviousMonth.toISODate() ?? '',
          TransactionType.FUNDING_TRANSACTION,
          TransactionType.REBALANCE_TRANSACTION,
        ])
        // Get the sum of the funding transactions from the previous month
        // .withAggregate('transactionCategory', (query) => {
        //   query.sum('amount').as('previousFunding')
        //     .whereHas('transaction', (transQuery) => {
        //       transQuery.where('date', '<', firstDayOfMonth.toISODate() ?? '')
        //         .andWhere('date', '>=', firstDayOfPreviousMonth.toISODate() ?? '')
        //         .andWhere('type', TransactionType.FUNDING_TRANSACTION)
        //     })
        // })
        .joinRaw(`left outer join
          (
            select
              transCats."categoryId",
              sum(transCats.amount) as "previousFunding",
              sum(coalesce(transCats."baseAmount", 0)) as "previousBaseAmount"
            from transactions t
            cross join lateral jsonb_to_recordset(t.categories) as transCats("categoryId" int, amount decimal, "baseAmount" decimal)
            where t.date < ?
            and t.date >= ?
            and t.deleted = false
            and t.type = ?
            group by transCats."categoryId"
          ) AS T3 on T3."categoryId" = categories.id
        `, [
          firstDayOfMonth.toISODate() ?? '',
          firstDayOfPreviousMonth.toISODate() ?? '',
          TransactionType.FUNDING_TRANSACTION,
        ])
        // Get the sum of the category transfers from the previous month
        // .withAggregate('transactionCategory', (query) => {
        //   query.sum('amount').as('previousCatTransfers')
        //     .whereHas('transaction', (transQuery) => {
        //       transQuery.where('date', '<', firstDayOfMonth.toISODate() ?? '')
        //         .andWhere('date', '>=', firstDayOfPreviousMonth.toISODate() ?? '')
        //         .andWhere('type', TransactionType.REBALANCE_TRANSACTION)
        //     })
        // })
        .joinRaw(`left outer join
          (
            select transCats."categoryId", sum(transCats.amount) as "previousCatTransfers"
            from transactions t
            cross join lateral jsonb_to_recordset(t.categories) as transCats("categoryId" int, amount decimal)
            where t.date < ?
            and t.date >= ?
            and t.deleted = false
            and t.type = ?
            group by transCats."categoryId"
          ) AS T4 on T4."categoryId" = categories.id
        `, [
          firstDayOfMonth.toISODate() ?? '',
          firstDayOfPreviousMonth.toISODate() ?? '',
          TransactionType.REBALANCE_TRANSACTION,
        ])

      return {
        data: categories.map((c) => ({
          id: c.id,
          name: c.name,
          balance: (c.balance - (parseFloat(c.$extras.sum ?? 0))),
          previousSum: parseFloat(c.$extras.previousSum ?? 0),
          previousFunding: parseFloat(c.$extras.previousFunding ?? 0),
          previousBaseAmount: parseFloat(c.$extras.previousBaseAmount ?? 0),
          previousCatTransfers: parseFloat(c.$extras.previousCatTransfers ?? 0),
        })),
      }
    }

    // const result = await budget.related('groups').query()
    //   .preload('categories', (catQuery) => {
    //     catQuery.orderBy('name', 'asc')
    //   })
    //   .orderBy('name', 'asc');

    const groups = await budget.related('groups').query()
    const categories = await Category.query()
      .whereHas('group', (q) => {
        q.where('budgetId', budget.id)
      })

    return {
      data: {
        groups,
        categories,
      },
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async addGroup({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<ApiResponse<Group>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validateUsing(
      addGroup,
      {
        meta: {
          budgetId: user.budgetId,
        },
      },
    );

    const group = await new Group()
      .fill({
        name: requestData.name,
        budgetId: user.budgetId,
        type: GroupType.Regular,
        parentGroupId: requestData.parentGroupId,
      })
      .save();

    return {
      data: group
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateGroup({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { groupId } = request.params();
    const requestData = await request.validateUsing(
      updateGroup,
      {
        meta: {
          budgetId: user.budgetId,
          groupId,
        },
      },
    );

    const group = await Group.findOrFail(groupId);

    group.merge({
      name: requestData.name,
      hidden: requestData.hidden,
      parentGroupId: requestData.parentGroupId,
    });

    await group.save();

    return {
      data: group,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteGroup({ request, auth: { user } }: HttpContext): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { groupId } = request.params();
    await request.validateUsing(deleteGroup);

    const group = await Group.findOrFail(groupId);

    await group.delete();
  }

  // eslint-disable-next-line class-methods-use-this
  public async addCategory({
    request,
  }: HttpContext): Promise<Category> {
    const { groupId } = request.params();
    const requestData = await request.validateUsing(addCategory);

    const category = new Category();

    await category
      .fill({
        type: requestData.type,
        groupId: parseInt(groupId, 10),
        name: requestData.name,
        balance: 0,
        fundingAmount: requestData.fundingAmount,
        includeFundingTransfers: requestData.type === CategoryType.Bill ? false : requestData.includeFundingTransfers,
        goalDate: requestData.goalDate ? DateTime.fromJSDate(requestData.goalDate) : undefined,
        recurrence: requestData.recurrence,
        useGoal: requestData.useGoal,
        fundingCategories: requestData.fundingCategories,
      })
      .save();

    return category;
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateCategory({
    request,
  }: HttpContext): Promise<Category> {
    const { groupId, catId } = request.params();
    const requestData = await request.validateUsing(updateCategory);

    const category = await Category.findOrFail(catId);

    category.merge({
      type: requestData.type,
      name: requestData.name,
      groupId,
      suspended: requestData.suspended,
      fundingAmount: requestData.fundingAmount,
      includeFundingTransfers: requestData.includeFundingTransfers,
      hidden: requestData.hidden,
      useGoal: requestData.useGoal,
      goalDate: requestData.goalDate ? DateTime.fromJSDate(requestData.goalDate) : undefined,
      recurrence: requestData.recurrence,
      fundingCategories: requestData.fundingCategories,
    });

    await category.save();

    return category;
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteCategory({ request, logger }: HttpContext): Promise<void> {
    const { catId } = request.params();
    await request.validateUsing(deleteCategory);

    const trx = await db.transaction();

    try {
      const category = await Category.findOrFail(catId, { client: trx });

      if (category.type === CategoryType.Loan) {
        const loan = await Loan.findBy('categoryId', catId, { client: trx });

        if (loan) {
          await loan.delete();
        }
      }

      await category.delete();

      await trx.commit();
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async transactions({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<ApiResponse<TransactionsResponse>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const { catId } = request.params();

    const categoryId = parseInt(catId, 10);

    const result: TransactionsResponse = {
      transactions: [],
      transactionsCount: 0,
      balance: 0,
    }

    const cat = await Category.findOrFail(categoryId);

    result.balance = cat.balance;

    result.transactions = (await cat.transactions(
      budget, request.qs().limit, request.qs().offset,
    ))
      .map((t) => (
        t.serialize(transactionFields) as TransactionProps
      ));

    result.transactionsCount = await cat.transactionsCount(budget)

    return {
      data: result,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async transfer(
    { request, auth: { user }, logger }: HttpContext,
  ): Promise<ApiResponse<{ balances: CategoryBalanceProps[] }>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { tfrId } = request.params();
    const requestData = await request.validate(UpdateCategoryTransferValidator);

    const trx = await db.transaction();

    try {
      user.useTransaction(trx);

      const budget = await user.related('budget').query()
        .forUpdate()
        .firstOrFail();

      const result: {
        balances: CategoryBalanceProps[],
        transaction: {
          id?: number,
          date?: string,
          name?: string,
          pending?: boolean,
          sortOrder?: number,
          type?: TransactionType,
          accountName?: string | null,
          amount?: string | null,
          institutionName?: string | null,
        },
      } = { balances: [], transaction: {} };

      const { categories, date, type } = requestData;
      let transaction: Transaction;
      const categeoryDeltas: Map<number, number> = new Map();

      if (tfrId === undefined) {
        transaction = await Transaction // budget.related('transactions')
          .create({
            date: DateTime.fromISO(date),
            type,
            categories: categories.map((category) => ({
              categoryId: category.categoryId,
              amount: category.amount,
              comment: category.comment,
              funder: category.funder,
              fundingCategories: category.fundingCategories,
              includeFundingTransfers: category.includeFundingTransfers,
              baseAmount: category.baseAmount,
            })),
            budgetId: budget.id,
          }, { client: trx });

        result.transaction = {
          id: transaction.id,
          date,
          name: type === TransactionType.FUNDING_TRANSACTION ? 'Category Funding' : 'Category Rebalance',
          pending: false,
          sortOrder: 2147483647,
          type,
          accountName: null,
          amount: null,
          institutionName: null,
        };
      }
      else {
        transaction = await budget.related('transactions').query()
          .where('id', tfrId)
          .firstOrFail();

        // eslint-disable-next-line no-restricted-syntax
        for (const transCategory of transaction.categories) {
          const delta = categeoryDeltas.get(transCategory.categoryId) ?? 0;
          categeoryDeltas.set(transCategory.categoryId, -transCategory.amount + delta)
        }

        await transaction
          .merge({
            date: DateTime.fromISO(date),
            categories: categories.map((category) => ({
              categoryId: category.categoryId,
              amount: category.amount,
              comment: category.comment,
              funder: category.funder,
              fundingCategories: category.fundingCategories,
              includeFundingTransfers: category.includeFundingTransfers,
              baseAmount: category.baseAmount,
            })),
          })
          .save()
      }

      // const existingSplits: StrictValues[] = [];

      // Insert the category splits
      // eslint-disable-next-line no-restricted-syntax
      for (const transCategory of categories) {
        const delta = categeoryDeltas.get(transCategory.categoryId) ?? 0;
        categeoryDeltas.set(transCategory.categoryId, transCategory.amount + delta);
      }

      // eslint-disable-next-line no-restricted-syntax
      for (const [categoryId, delta] of categeoryDeltas) {
        // eslint-disable-next-line no-await-in-loop
        const category = await Category.findOrFail(categoryId, { client: trx });

        category.balance += delta;

        // eslint-disable-next-line no-await-in-loop
        await category.save();

        result.balances.push({ id: category.id, balance: category.balance });
      }

      result.transaction = transaction.serialize(transactionFields);

      await trx.commit();

      return {
        data: result,
      }
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async transferDelete({ request, logger }: HttpContext): Promise<void> {
    const trx = await db.transaction();

    try {
      const { tfrId } = request.params();

      const categoryTransfer = await CategoryTransfer.findOrFail(tfrId, { client: trx });

      const categorySplits = await categoryTransfer.splits(trx);

      // eslint-disable-next-line no-restricted-syntax
      for (const cs of categorySplits) {
        // eslint-disable-next-line no-await-in-loop
        const category = await Category.find(cs.categoryId, { client: trx });

        if (category) {
          category.balance -= cs.amount;

          category.save();

          // eslint-disable-next-line no-await-in-loop
          await cs.delete();
        }
      }

      await categoryTransfer.delete();

      await trx.commit();
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async balances({
    request,
    auth: {
      user,
    },
  }: HttpContext): Promise<Array<GroupItem>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const { date, id } = request.qs();

    return Category.balances(budget, date, id !== undefined ? parseInt(id, 10) : id);
  }

  static getGoalDate(goalDate?: DateTime | null, recurrence = 1): DateTime | null {
    if (goalDate) {
      let adjustedGoal = goalDate
      const now = DateTime.now().startOf('month');

      const monthDiff = goalDate.startOf('month').diff(now, 'months').months;
      if (monthDiff < 0) {
        const numPeriods = Math.ceil(-monthDiff / recurrence);
        adjustedGoal = goalDate.plus({ months: numPeriods * recurrence })
      }

      return adjustedGoal;
    }

    return null;
  }

  // eslint-disable-next-line class-methods-use-this
  public async getBills({
    auth: {
      user,
    },
  }: HttpContext): Promise<BillProps[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const bills = await Category.query()
      .whereHas('group', (query) => {
        query.where('budgetId', budget.id)
      })
      .where('type', CategoryType.Bill);

    const firstDayOfMonth = DateTime.now()
      .set({
        day: 1, hour: 0, minute: 0, second: 0, millisecond: 0,
      })

    // eslint-disable-next-line no-restricted-syntax
    for (const bill of bills) {
      bill.goalDate = CategoriesController.getGoalDate(bill.goalDate, bill.recurrence)

      // eslint-disable-next-line no-await-in-loop
      const debits = await budget
        .related('transactions').query()
        // eslint-disable-next-line max-len
        .joinRaw('cross join lateral jsonb_to_recordset(transactions.categories) as "transCats"("categoryId" int, amount decimal)')
        .where('transCats.categoryId', bill.id)
        .where('deleted', false)
        .where('date', '>=', firstDayOfMonth.toISODate())
        .where('transCats.amount', '<', 0)
        .sum('transCats.amount', 'debits')

      bill.$extras.debits = debits[0].$extras.debits;
    }

    bills.sort((a, b) => (a.goalDate && b.goalDate ? a.goalDate.diff(b.goalDate, 'days').days : 0))

    // eslint-disable-next-line no-restricted-syntax
    // for (const b of bills) {
    //   console.log(`${b.name}, ${b.fundingAmount}, ${b.balance}, ${b.$extras.goalDate.toISODate()}`)
    // }

    return bills.map<BillProps>((bill) => ({
      id: bill.id,
      name: bill.name,
      fundingAmount: bill.fundingAmount,
      balance: bill.balance,
      goalDate: bill.goalDate?.toISODate() ?? '',
      recurrence: bill.recurrence,
      suspended: bill.suspended,
      debits: bill.$extras.debits !== null ? parseFloat(bill.$extras.debits ?? '0.00') : null,
    }));
  }
}

export default CategoriesController;
