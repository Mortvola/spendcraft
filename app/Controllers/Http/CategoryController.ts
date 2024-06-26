import Database, { StrictValues } from '@ioc:Adonis/Lucid/Database';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Category, { GroupItem } from 'App/Models/Category';
import CategoryTransfer from 'App/Models/CategoryTransfer';
import AddGroupValidator from 'App/Validators/AddGroupValidator';
import UpdateGroupValidator from 'App/Validators/UpdateGroupValidator';
import DeleteGroupValidator from 'App/Validators/DeleteGroupValidator';
import AddCategoryValidator from 'App/Validators/AddCategoryValidator';
import UpdateCategoryValidator from 'App/Validators/UpdateCategoryValidator';
import DeleteCategoryValidator from 'App/Validators/DeleteCategoryValidator';
import UpdateCategoryTransferValidator from 'App/Validators/UpdateCategoryTransferValidator';
import Transaction from 'App/Models/Transaction';
import TransactionCategory from 'App/Models/TransactionCategory';
import Loan from 'App/Models/Loan';
import {
  CategoryBalanceProps,
  TransactionsResponse,
  TransactionProps, TransactionType, FundingInfoProps,
} from 'Common/ResponseTypes';
import Group from 'App/Models/Group';
import { DateTime } from 'luxon';
import transactionFields from './transactionFields';

class CategoryController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    request,
    auth: { user },
  }: HttpContextContract): Promise<Group[] | FundingInfoProps[]> {
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
        .withAggregate('transactionCategory', (query) => {
          query.sum('amount').as('sum')
            .whereHas('transaction', (transQuery) => {
              transQuery.where('date', '>=', firstDayOfMonth.toISODate() ?? '')
            })
        })
        // Get the sum of the transactions (minus funding and category transfers) from the prrevious month
        .withAggregate('transactionCategory', (query) => {
          query.sum('amount').as('previousSum')
            .whereHas('transaction', (transQuery) => {
              transQuery.where('date', '<', firstDayOfMonth.toISODate() ?? '')
                .andWhere('date', '>=', firstDayOfPreviousMonth.toISODate() ?? '')
                .andWhereNotIn('type', [TransactionType.FUNDING_TRANSACTION, TransactionType.REBALANCE_TRANSACTION])
            })
        })
        // Get the sum of the funding transactions from the previous month
        .withAggregate('transactionCategory', (query) => {
          query.sum('amount').as('previousFunding')
            .whereHas('transaction', (transQuery) => {
              transQuery.where('date', '<', firstDayOfMonth.toISODate() ?? '')
                .andWhere('date', '>=', firstDayOfPreviousMonth.toISODate() ?? '')
                .andWhere('type', TransactionType.FUNDING_TRANSACTION)
            })
        })
        // Get the sum of the category transfers from the previous month
        .withAggregate('transactionCategory', (query) => {
          query.sum('amount').as('previousCatTransfers')
            .whereHas('transaction', (transQuery) => {
              transQuery.where('date', '<', firstDayOfMonth.toISODate() ?? '')
                .andWhere('date', '>=', firstDayOfPreviousMonth.toISODate() ?? '')
                .andWhere('type', TransactionType.REBALANCE_TRANSACTION)
            })
        })

      return categories.map((c) => ({
        id: c.id,
        name: c.name,
        balance: (c.balance - (parseFloat(c.$extras.sum ?? 0))),
        previousSum: parseFloat(c.$extras.previousSum ?? 0),
        previousFunding: parseFloat(c.$extras.previousFunding ?? 0),
        previousCatTransfers: parseFloat(c.$extras.previousCatTransfers ?? 0),
      }));
    }

    const result = await budget.related('groups').query()
      .preload('categories', (catQuery) => {
        catQuery.orderBy('name', 'asc')
      })
      .orderBy('name', 'asc');

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async addGroup({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Group> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validate(AddGroupValidator);

    const group = await new Group()
      .fill({
        name: requestData.name,
        budgetId: user.budgetId,
        type: 'REGULAR',
      })
      .save();

    return group;
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateGroup({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { groupId } = request.params();
    const requestData = await request.validate(UpdateGroupValidator);

    const group = await Group.findOrFail(groupId);

    group.merge({
      name: requestData.name,
      hidden: requestData.hidden,
    });

    await group.save();

    return { id: groupId, name: group.name, hidden: group.hidden };
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteGroup({ request, auth: { user } }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { groupId } = request.params();
    await request.validate(DeleteGroupValidator);

    const group = await Group.findOrFail(groupId);

    await group.delete();
  }

  // eslint-disable-next-line class-methods-use-this
  public async addCategory({
    request,
  }: HttpContextContract): Promise<Category> {
    const { groupId } = request.params();
    const requestData = await request.validate(AddCategoryValidator);

    const category = new Category();

    await category
      .fill({
        type: requestData.type,
        groupId: parseInt(groupId, 10),
        name: requestData.name,
        balance: 0,
        monthlyExpenses: requestData.monthlyExpenses ?? false,
        fundingAmount: requestData.fundingAmount,
        goalDate: requestData.goalDate,
        recurrence: requestData.recurrence,
        useGoal: requestData.useGoal,
      })
      .save();

    return category;
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateCategory({
    request,
  }: HttpContextContract): Promise<Category> {
    const { groupId, catId } = request.params();
    const requestData = await request.validate(UpdateCategoryValidator);

    const category = await Category.findOrFail(catId);

    category.merge({
      type: requestData.type,
      name: requestData.name,
      monthlyExpenses: requestData.monthlyExpenses,
      groupId,
      fundingAmount: requestData.fundingAmount,
      hidden: requestData.hidden,
      useGoal: requestData.useGoal,
      goalDate: requestData.goalDate,
      recurrence: requestData.recurrence,
    });

    await category.save();

    return category;
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteCategory({ request, logger }: HttpContextContract): Promise<void> {
    const { catId } = request.params();
    await request.validate(DeleteCategoryValidator);

    const trx = await Database.transaction();

    try {
      const category = await Category.findOrFail(catId, { client: trx });

      if (category.type === 'LOAN') {
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
  }: HttpContextContract): Promise<TransactionsResponse> {
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
    };

    const cat = await Category.findOrFail(categoryId);

    result.balance = cat.balance;

    result.transactions = (await cat.transactions(
      budget, request.qs().limit, request.qs().offset,
    ))
      .map((t) => (
        t.serialize(transactionFields) as TransactionProps
      ));

    result.transactionsCount = await cat.transactionsCount(budget)

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async transfer(
    { request, auth: { user }, logger }: HttpContextContract,
  ): Promise<{ balances: CategoryBalanceProps[] }> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const { tfrId } = request.params();
    const requestData = await request.validate(UpdateCategoryTransferValidator);

    const trx = await Database.transaction();

    try {
      const result: {
        balances: CategoryBalanceProps[],
        transaction: {
          transactionCategories: unknown[],
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
      } = { balances: [], transaction: { transactionCategories: [] } };

      const { categories } = requestData;
      if (Array.isArray(categories)) {
        const { date, type } = requestData;
        let transaction: Transaction;

        if (tfrId === undefined) {
          transaction = await new Transaction()
            .useTransaction(trx)
            .fill({
              date: DateTime.fromISO(date), type, budgetId: budget.id,
            })
            .save()

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
            transactionCategories: [],
          };
        }
        else {
          transaction = await Transaction.findOrFail(tfrId, { client: trx });

          await transaction
            .merge({
              date: DateTime.fromISO(date),
            })
            .save()
        }

        const existingSplits: StrictValues[] = [];

        // Insert the category splits
        // eslint-disable-next-line no-restricted-syntax
        for (const split of categories) {
          if (split.amount !== 0) {
            let { amount } = split;

            if (split.id) {
              existingSplits.push(split.id);

              // eslint-disable-next-line no-await-in-loop
              const existingSplit = await TransactionCategory.findOrFail(split.id, { client: trx });

              amount = split.amount - existingSplit.amount;

              existingSplit.amount = split.amount;

              if (split.expected !== undefined) {
                existingSplit.expected = split.expected;
              }

              existingSplit.save();
            }
            else {
              const newSplit = (new TransactionCategory()).useTransaction(trx);

              // eslint-disable-next-line no-await-in-loop
              await newSplit
                .fill({
                  transactionId: transaction.id,
                  categoryId: split.categoryId,
                  amount: split.amount,
                  expected: split.expected,
                })
                .save();

              existingSplits.push(newSplit.id);

              amount = split.amount;
            }

            // eslint-disable-next-line no-await-in-loop
            const category = await Category.findOrFail(split.categoryId, { client: trx });

            category.balance += amount;

            category.save();

            result.balances.push({ id: category.id, balance: category.balance });
          }
        }

        // Delete splits that are not in the array of ids
        const query = trx
          .from('transaction_categories')
          .whereNotIn('id', existingSplits)
          .andWhere('transaction_id', transaction.id);
        const toDelete = await query.select('category_id AS categoryId', 'amount');

        // eslint-disable-next-line no-restricted-syntax
        for (const td of toDelete) {
          // eslint-disable-next-line no-await-in-loop
          const category = await Category.findOrFail(td.categoryId, { client: trx });

          category.balance -= td.amount;

          result.balances.push({ id: category.id, balance: category.balance });

          category.save();
        }

        await query.delete();

        result.transaction.transactionCategories = await transaction.related('transactionCategories').query();
      }

      await trx.commit();

      return result;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async transferDelete({ request, logger }: HttpContextContract): Promise<void> {
    const trx = await Database.transaction();

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
  }: HttpContextContract): Promise<Array<GroupItem>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const { date, id } = request.qs();

    return Category.balances(budget, date, id !== undefined ? parseInt(id, 10) : id);
  }
}

export default CategoryController;
