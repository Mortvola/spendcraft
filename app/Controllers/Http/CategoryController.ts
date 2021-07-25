import Database from '@ioc:Adonis/Lucid/Database';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Category, { GroupItem } from 'App/Models/Category';
import CategoryTransfer from 'App/Models/CategoryTransfer';
import AccountTransaction from 'App/Models/AccountTransaction';
import { GroupHistoryItem } from 'App/Models/User';
import AddGroupValidator from 'App/Validators/AddGroupValidator';
import UpdateGroupValidator from 'App/Validators/UpdateGroupValidator';
import DeleteGroupValidator from 'App/Validators/DeleteGroupValidator';
import AddCategoryValidator from 'App/Validators/AddCategoryValidator';
import UpdateCategoryValidator from 'App/Validators/UpdateCategoryValidator';
import DeleteCategoryValidator from 'App/Validators/DeleteCategoryValidator';
import UpdateCategoryTransferValidator from 'App/Validators/UpdateCategoryTransferValidator';
import Transaction from 'App/Models/Transaction';
import { StrictValues } from '@ioc:Adonis/Lucid/Database';
import TransactionCategory from 'App/Models/TransactionCategory';
import { AddCategoryResponse, UpdateCategoryResponse } from '../../../common/ResponseTypes';

type Transactions = {
  transactions: Array<AccountTransaction>,
  pending: Array<AccountTransaction>,
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
        'c.system AS systemCategory',
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

      if (group.system && group.name === 'Loans') {
        // Fetch the user's loans and place them into this group
        const loans = await user.related('loans').query();

        loans.forEach((loan) => {
          if (!group) {
            throw new Error('group is null');
          }

          group.categories.push({
            id: loan.id,
            name: loan.name,
          });
        });
      }
      else if (cat.categoryId) {
        group.categories.push({
          id: cat.categoryId,
          name: cat.categoryName,
          system: cat.systemCategory,
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
    await request.validate(AddGroupValidator);

    const id = await Database.insertQuery().table('groups')
      .insert({ name: request.input('name'), user_id: user.id })
      .returning('id');

    return {
      id: id[0],
      name: request.input('name'),
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

    await request.validate(UpdateGroupValidator);

    await Database.query().from('groups')
      .where({ id: request.params().groupId, user_id: user.id })
      .update({ name: request.input('name') });

    return { id: request.params().groupId, name: request.input('name') };
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteGroup({ request, auth: { user } }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    await request.validate(DeleteGroupValidator);

    await Database.query().from('groups').where({ id: request.params().groupId, user_id: user.id }).delete();
  }

  // eslint-disable-next-line class-methods-use-this
  public async addCategory({
    request,
  }: HttpContextContract): Promise<AddCategoryResponse> {
    await request.validate(AddCategoryValidator);

    const category = new Category();

    await category
      .fill({ groupId: parseInt(request.params().groupId, 10), name: request.input('name'), amount: 0 })
      .save();

    return {
      groupId: category.groupId,
      id: category.id,
      name: category.name,
      balance: category.amount,
      system: false,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateCategory({
    request,
  }: HttpContextContract): Promise<UpdateCategoryResponse> {
    await request.validate(UpdateCategoryValidator);

    const { catId } = request.params();
    const name = request.input('name');

    await Database.query().from('categories').where({ id: catId }).update({ name });

    return { name };
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteCategory({ request }: HttpContextContract): Promise<void> {
    await request.validate(DeleteCategoryValidator);

    await Database.query().from('categories').where({ id: request.params().catId }).delete();
  }

  // eslint-disable-next-line class-methods-use-this
  public async transactions({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Transactions> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const categoryId = parseInt(request.params().catId, 10);

    const result: Transactions = {
      transactions: [],
      pending: [],
      balance: 0,
    };

    const [cat] = await Database.query()
      .select(Database.raw('CAST(amount AS float) as amount'), 'cats.name AS name', 'cats.system AS system')
      .from('categories AS cats')
      .join('groups', 'groups.id', 'group_id')
      .where('cats.id', categoryId)
      .andWhere('groups.user_id', user.id);

    result.balance = cat.amount;

    const subquery = Database.query()
      .select(
        Database.raw(`COUNT(CASE WHEN category_id = ${categoryId} THEN 1 ELSE NULL END) AS count`),
        Database.raw('sum(splits.amount) AS sum'),
        Database.raw('json_agg (('
          + '\'{"categoryId": \' || category_id || '
          + '\', "amount": \' || splits.amount || '
          + '\', "category": \' || \'"\' || cats.name || \'"\' || '
          + '\', "group": \' || \'"\' || groups.name || \'"\' || '
          + '\', "id": \' || splits.id || '
          + '\'}\')::json) AS categories'),
        'transaction_id',
      )
      .from('transaction_categories AS splits')
      .join('categories AS cats', 'cats.id', 'splits.category_id')
      .join('groups', 'groups.id', 'cats.group_id')
      .where('groups.user_id', user.id)
      .groupBy('transaction_id')
      .toQuery();

    const transName = 'COALESCE(acct_trans.name, '
      + 'CASE WHEN trans.type = 2 THEN \'Category Funding\' '
      + 'WHEN trans.type = 3 THEN \'Category Rebalance\' '
      + 'ELSE \'Category Transfer\' '
      + 'END)';

    const query = Database.query()
      .select(
        'trans.id AS id',
        'trans.type AS type',
        Database.raw('COALESCE(trans.sort_order, 2147483647) AS "sortOrder"'),
        Database.raw('date::text'),
        Database.raw(`${transName} AS name`),
        'splits.categories AS categories',
        'inst.name AS instituteName',
        'acct.name AS accountName',
        Database.raw('CAST(acct_trans.amount AS real) AS amount'),
        Database.raw('COALESCE(acct_trans.pending, false) AS pending'),
      )
      .from('transactions AS trans')
      .leftJoin('account_transactions as acct_trans', 'acct_trans.transaction_id', 'trans.id')
      .leftJoin('accounts AS acct', 'acct.id', 'acct_trans.account_id')
      .leftJoin('institutions AS inst', 'inst.id', 'acct.institution_id')
      .joinRaw(`left join (${subquery}) AS splits ON splits.transaction_id = trans.id`)
      .where('trans.user_id', user.id)
      .where((q) => {
        q.where('inst.user_id', user.id).orWhereNull('inst.user_id');
      })
      .orderBy('pending', 'desc')
      .orderBy('date', 'desc')
      .orderBy(Database.raw('COALESCE(trans.sort_order, 2147483647)'), 'desc')
      .orderBy(Database.raw(transName));

    if (cat.system && cat.name === 'Unassigned') {
      query.whereNull('splits.categories');
    }
    else {
      query.where('splits.count', '>', 0);
    }

    result.transactions = await query;

    if (result.transactions.length > 0) {
      // Move pending transactions to the pending array
      // Find first transaction that is not pending (all pending
      // should be up front in the array)
      const index = result.transactions.findIndex((t) => !t.pending);

      if (index === -1) {
        // The array contains only pending transactions
        result.pending = result.transactions;
        result.transactions = [];
      }
      else if (index > 0) {
        // The array contains at least one pending transaction
        result.pending = result.transactions.splice(0, index);
      }
    }

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async transfer(
    { request, auth: { user } }: HttpContextContract,
  ): Promise<{ balances: { id: number, balance: number}[] }> {
    if (!user) {
      throw new Error('user is not defined');
    }

    await request.validate(UpdateCategoryTransferValidator);

    const trx = await Database.transaction();
    const result: {
      balances: Array<{ id: number, balance: number}>,
      transaction: {
        categories: unknown[],
        id?: number,
        date?: string,
        name?: string,
        pending?: boolean,
        sortOrder?: number,
        type?: number,
        accountName?: string | null,
        amount?: string | null,
        institutionName?: string | null,
      },
    } = { balances: [], transaction: { categories: [] } };

    try {
      const categories = request.input('categories');
      if (Array.isArray(categories)) {
        const date = request.input('date');
        const type = request.input('type');
        let transactionId = request.params().tfrId;

        if (transactionId === undefined) {
          [transactionId] = await trx.insertQuery().insert({
            date, type, user_id: user.id,
          }).table('transactions').returning('id');

          result.transaction = {
            id: transactionId,
            date,
            name: 'Category Rebalance',
            pending: false,
            sortOrder: 2147483647,
            type: 3,
            accountName: null,
            amount: null,
            institutionName: null,
            categories: [],
          };
        }

        const existingSplits: StrictValues[] = [];

        // Insert the category splits
        await Promise.all(categories.map(async (split) => {
          if (split.amount !== 0) {
            let { amount } = split;

            if (split.id) {
              existingSplits.push(split.id);

              const existingSplit = await TransactionCategory.findOrFail(split.id, { client: trx });

              amount = split.amount - existingSplit.amount;

              existingSplit.amount = split.amount;
              existingSplit.save();
            }
            else {
              const newSplit = new TransactionCategory();
              newSplit.useTransaction(trx);
              await newSplit
                .fill({ transactionId, categoryId: split.categoryId, amount: split.amount })
                .save();

              existingSplits.push(newSplit.id);

              amount = split.amount;
            }

            const category = await Category.findOrFail(split.categoryId, { client: trx });

            category.amount += amount;

            category.save();

            result.balances.push({ id: category.id, balance: category.amount });
          }
        }));

        // Delete splits that are not in the array of ids
        const query = trx
          .from('transaction_categories')
          .whereNotIn('id', existingSplits)
          .andWhere('transaction_id', transactionId);
        const toDelete = await query.select('category_id AS categoryId', 'amount');

        await Promise.all(toDelete.map(async (td) => {
          const category = await Category.findOrFail(td.categoryId, { client: trx });

          category.amount -= td.amount;

          result.balances.push({ id: category.id, balance: category.amount });

          category.save();
        }));

        await query.delete();

        const transaction = await Transaction.findOrFail(transactionId, { client: trx });
        const cats = await transaction.related('categories').query().preload('category', (catQuery) => {
          catQuery.preload('group');
        });

        result.transaction.categories = cats.map((cat) => ({
          amount: cat.amount,
          category: cat.category.name,
          categoryId: cat.categoryId,
          group: cat.category.group.name,
          id: cat.id,
        }));
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

      await Promise.all(categorySplits.map(async (cs) => {
        const category = await Category.find(cs.categoryId, { client: trx });

        if (category) {
          category.amount -= cs.amount;

          category.save();

          await cs.delete();
        }
      }));

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
