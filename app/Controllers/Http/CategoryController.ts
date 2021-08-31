import Database, { StrictValues } from '@ioc:Adonis/Lucid/Database';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Category, { GroupItem } from 'App/Models/Category';
import CategoryTransfer from 'App/Models/CategoryTransfer';
import { GroupHistoryItem } from 'App/Models/User';
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
  LoanTransactionProps, TransactionProps, TransactionType, UpdateCategoryResponse,
} from 'Common/ResponseTypes';

type TransactionsResponse = {
  transactions: TransactionProps[],
  pending: TransactionProps[],
  loan: {
    balance: number,
    transactions: LoanTransactionProps[],
  }
  balance: number,
}

class CategoryController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    auth: { user },
  }: HttpContextContract): Promise<Array<Record<string, unknown>>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const rows = await Database.query()
      .select(
        'g.id AS groupId',
        'g.name AS groupName',
        'g.system AS systemGroup',
        'c.id AS categoryId',
        'c.name as categoryName',
        'c.type',
        Database.raw('CAST(amount AS float) as balance'),
      )
      .from('groups AS g')
      .leftJoin('categories AS c', 'c.group_id', 'g.id')
      .where('user_id', user.id)
      .orderBy('g.name')
      .orderBy('c.name');

    const groups: GroupItem[] = [];
    // let group: GroupItem | null = null;

    // Create a tree structure with groups at the top level
    // and categories within each group.
    await Promise.all(rows.map(async (cat) => {
      let group = groups.find((g) => (g.id === cat.groupId));
      if (!group) {
        group = {
          id: cat.groupId,
          name: cat.groupName,
          system: cat.systemGroup,
          categories: [],
        };

        groups.push(group);
      }

      if (cat.categoryId) {
        group.categories.push({
          id: cat.categoryId,
          name: cat.categoryName,
          type: cat.type,
          balance: cat.balance,
        });
      }
    }));

    return groups;
  }

  // eslint-disable-next-line class-methods-use-this
  public async addGroup({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validate(AddGroupValidator);

    const id = await Database.insertQuery().table('groups')
      .insert({ name: requestData.name, user_id: user.id })
      .returning('id');

    return {
      id: id[0],
      name: requestData.name,
      system: false,
      categories: [],
    };
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

    await Database.query().from('groups')
      .where({ id: groupId, user_id: user.id })
      .update({ name: requestData.name });

    return { id: groupId, name: requestData.name };
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteGroup({ request, auth: { user } }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { groupId } = request.params();
    await request.validate(DeleteGroupValidator);

    await Database.query().from('groups').where({ id: groupId, user_id: user.id }).delete();
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
        groupId: parseInt(groupId, 10),
        name: requestData.name,
        amount: 0,
        type: 'REGULAR',
      })
      .save();

    return category;
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateCategory({
    request,
  }: HttpContextContract): Promise<UpdateCategoryResponse> {
    const { groupId, catId } = request.params();
    const requestData = await request.validate(UpdateCategoryValidator);

    const category = await Category.findOrFail(catId);

    category.merge({
      name: requestData.name,
      groupId,
    });

    await category.save();

    return { name: requestData.name };
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteCategory({ request }: HttpContextContract): Promise<void> {
    const { catId } = request.params();
    await request.validate(DeleteCategoryValidator);

    const trx = await Database.transaction();
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

    const { catId } = request.params();

    const categoryId = parseInt(catId, 10);

    const result: TransactionsResponse = {
      transactions: [],
      pending: [],
      loan: {
        balance: 0,
        transactions: [],
      },
      balance: 0,
    };

    const cat = await Category.findOrFail(categoryId);

    result.balance = cat.amount;

    if (cat.type === 'UNASSIGNED') {
      const transactions = await user
        .related('transactions').query()
        .where((query) => {
          query
            .doesntHave('transactionCategories')
            .orWhereHas('transactionCategories', (q) => {
              q.where('categoryId', cat.id);
            })
        })
        .whereHas('accountTransaction', (q2) => {
          q2.where('pending', false)
        })
        .preload('accountTransaction', (accountTransaction) => {
          accountTransaction.preload('account', (account) => {
            account.preload('institution');
          });
        })
        .preload('transactionCategories');

      result.transactions = transactions.map((t) => (
        t.serialize() as TransactionProps
      ));

      const pending = await user
        .related('transactions').query()
        .where((query) => {
          query
            .doesntHave('transactionCategories')
            .orWhereHas('transactionCategories', (q) => {
              q.where('categoryId', cat.id);
            })
        })
        .whereHas('accountTransaction', (q2) => {
          q2.where('pending', true)
        })
        .preload('accountTransaction', (accountTransaction) => {
          accountTransaction.preload('account', (account) => {
            account.preload('institution');
          });
        })
        .preload('transactionCategories');

      result.pending = pending.map((t) => (
        t.serialize() as TransactionProps
      ));
    }
    else {
      const transactions = await user
        .related('transactions').query()
        .whereHas('transactionCategories', (query) => {
          query.where('categoryId', cat.id);
        })
        .preload('accountTransaction', (accountTransaction) => {
          accountTransaction.preload('account', (account) => {
            account.preload('institution');
          });
        })
        .preload('transactionCategories', (transactionCategory) => {
          transactionCategory.preload('loanTransaction');
        });

      result.transactions = transactions.map((t) => (
        t.serialize() as TransactionProps
      ));

      if (cat.type === 'LOAN') {
        const loan = await Loan.findByOrFail('categoryId', cat.id);

        result.loan = await loan.getProps();
      }
    }

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async transfer(
    { request, auth: { user } }: HttpContextContract,
  ): Promise<{ balances: CategoryBalanceProps[] }> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { tfrId } = request.params();
    const requestData = await request.validate(UpdateCategoryTransferValidator);

    const trx = await Database.transaction();
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

    try {
      const { categories } = requestData;
      if (Array.isArray(categories)) {
        const { date, type } = requestData;
        let transactionId = tfrId;

        if (transactionId === undefined) {
          [transactionId] = await trx.insertQuery().insert({
            date, type, user_id: user.id,
          }).table('transactions').returning('id');

          result.transaction = {
            id: transactionId,
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
              existingSplit.save();
            }
            else {
              const newSplit = (new TransactionCategory()).useTransaction(trx);

              // eslint-disable-next-line no-await-in-loop
              await newSplit
                .fill({ transactionId, categoryId: split.categoryId, amount: split.amount })
                .save();

              existingSplits.push(newSplit.id);

              amount = split.amount;
            }

            // eslint-disable-next-line no-await-in-loop
            const category = await Category.findOrFail(split.categoryId, { client: trx });

            category.amount += amount;

            category.save();

            result.balances.push({ id: category.id, balance: category.amount });
          }
        }

        // Delete splits that are not in the array of ids
        const query = trx
          .from('transaction_categories')
          .whereNotIn('id', existingSplits)
          .andWhere('transaction_id', transactionId);
        const toDelete = await query.select('category_id AS categoryId', 'amount');

        // eslint-disable-next-line no-restricted-syntax
        for (const td of toDelete) {
          // eslint-disable-next-line no-await-in-loop
          const category = await Category.findOrFail(td.categoryId, { client: trx });

          category.amount -= td.amount;

          result.balances.push({ id: category.id, balance: category.amount });

          category.save();
        }

        await query.delete();

        const transaction = await Transaction.findOrFail(transactionId, { client: trx });
        result.transaction.transactionCategories = await transaction.related('transactionCategories').query();
      }

      await trx.commit();
    }
    catch (error) {
      console.log(error);
      await trx.rollback();
    }

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async transferDelete({ request }: HttpContextContract): Promise<void> {
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
          category.amount -= cs.amount;

          category.save();

          // eslint-disable-next-line no-await-in-loop
          await cs.delete();
        }
      }

      await categoryTransfer.delete();

      await trx.commit();
    }
    catch (error) {
      console.log(error);
      await trx.rollback();
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

    const { date, id } = request.qs();

    return Category.balances(user.id, date, id);
  }

  // eslint-disable-next-line class-methods-use-this
  public async history({ auth: { user } }: HttpContextContract): Promise<Array<GroupHistoryItem>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    return user.history();
  }
}

export default CategoryController;
export { GroupHistoryItem };
