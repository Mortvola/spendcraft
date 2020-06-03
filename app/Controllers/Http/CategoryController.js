const Database = use('Database');
const Category = use('App/Models/Category');
const CategorySplit = use('App/Models/CategorySplit')
const CategoryTransfer = use('App/Models/CategoryTransfer')

class CategoryController {
    async get ({auth}) {

        let rows = await Database.select (
                'g.id AS groupId',
                'g.name AS groupName',
                'g.system AS systemGroup',
                'c.id AS categoryId',
                'c.name as categoryName',
                'c.system AS systemCategory',
                Database.raw('CAST(amount AS float) as amount'))
            .from('groups AS g')
            .leftJoin ('categories AS c', 'c.group_id', 'g.id')
            .where ('user_id', auth.user.id)
            .orderBy('g.name')
            .orderBy('c.name');

        let groups = [];
        let group;

        for (let cat of rows) {
            if (!group) {
                group = { id: cat.groupId, name: cat.groupName, system: cat.systemGroup, categories: [] };
            } else if (group.name !== cat.groupName) {
                groups.push(group);
                group = { id: cat.groupId, name: cat.groupName, system: cat.systemGroup, categories: [] };
            }

            if (cat.categoryId)
            {
                group.categories.push({ id: cat.categoryId, name: cat.categoryName, system: cat.systemCategory, amount: cat.amount });
            }
        }

        if (group) {
            groups.push(group);
        }

        return groups;
    }

    async addGroup ({request, auth}) {
        let id = await Database.insert({ name: request.body.name, user_id: auth.user.id }).into('groups').returning('id');

        return { id: id[0], name: request.body.name };
    }

    async updateGroup ({request, auth}) {

        await Database.table('groups').where({id: request.params.groupId, user_id: auth.user.id}).update({name: request.body.name});

        return { name: request.body.name };
    }

    async deleteGroup ({request, auth}) {
        await Database.table('groups').where({id: request.params.groupId, user_id: auth.user.id}).delete ();
    }

    async addCategory({ request }) {
        const id = await Database.insert({ group_id: request.body.groupId, name: request.body.name }).into('categories').returning('id');

        return { groupId: request.body.groupId, id: id[0], name: request.body.name };
    }

    static async updateCategory({ request }) {
        const { params: { catId }, body: { name } } = request;

        await Database.table('categories').where({ id: catId }).update({ name });

        return { name: request.body.name };
    }

    static async deleteCategory({ request }) {
        await Database.table('categories').where({ id: request.params.catId }).delete();
    }

    static async transactions({ request, auth }) {
        const categoryId = parseInt(request.params.catId, 10);

        const result = { transactions: [] };

        const cat = await Database.select(Database.raw('CAST(amount AS float) as amount'), 'cats.name AS name', 'cats.system AS system')
            .from('categories AS cats')
            .join('groups', 'groups.id', 'group_id')
            .where('cats.id', categoryId)
            .andWhere('groups.user_id', auth.user.id);

        result.balance = cat[0].amount;

        const subquery = Database.select(
            Database.raw(`COUNT(CASE WHEN category_id = ${categoryId} THEN 1 ELSE NULL END) AS count`),
            Database.raw('sum(splits.amount) AS sum'),
            Database.raw('json_agg (('
                    + "'{\"categoryId\": ' || category_id || "
                    + "', \"amount\": ' || splits.amount || "
                    + "', \"category\": ' || '\"' || cats.name || '\"' || "
                    + "', \"group\": ' || '\"' || groups.name || '\"' || "
                    + "', \"id\": ' || splits.id || "
                    + "'}')::json) AS categories"),
            'transaction_id',
        )
            .from('transaction_categories AS splits')
            .join('categories AS cats', 'cats.id', 'splits.category_id')
            .join('groups', 'groups.id', 'cats.group_id')
            .where('groups.user_id', auth.user.id)
            .groupBy('transaction_id');

        const transName = 'COALESCE(acct_trans.name, '
            + "CASE WHEN trans.type = 2 THEN 'Category Funding' "
            + "WHEN trans.type = 3 THEN 'Category Rebalance' "
            + "ELSE 'Category Transfer' "
            + 'END)';

        const query = Database.select(
            'trans.id AS id',
            'trans.type AS type',
            Database.raw('COALESCE(trans.sort_order, 2147483647) AS sort_order'),
            Database.raw('date::text'),
            Database.raw(`${transName} AS name`),
            'splits.categories AS categories',
            'inst.name AS institute_name',
            'acct.name AS account_name',
            Database.raw('CAST(acct_trans.amount AS real) AS amount'),
        )
            .from('transactions AS trans')
            .leftJoin('account_transactions as acct_trans', 'acct_trans.transaction_id', 'trans.id')
            .leftJoin('accounts AS acct', 'acct.id', 'acct_trans.account_id')
            .leftJoin('institutions AS inst', 'inst.id', 'acct.institution_id')
            .leftJoin(subquery.as('splits'), 'splits.transaction_id', 'trans.id')
            // .where('inst.user_id', auth.user.id)
            .orderBy('date', 'desc')
            .orderBy(Database.raw('COALESCE(trans.sort_order, 2147483647)'), 'desc')
            .orderBy(Database.raw(transName));

        if (cat[0].system && cat[0].name === 'Unassigned') {
            query.whereNull('splits.categories')
                .andWhere(function () {
                    this.where('acct_trans.pending', false)
                        .orWhereNull('acct_trans.pending');
                });
        }
        else {
            query.where('splits.count', '>', 0);
        }

        result.transactions = await query;

        return result;
    }

    static async transfer({ request }) {
        const trx = await Database.beginTransaction();

        const result = [];

        if (Array.isArray(request.body.categories)) {
            const { date, type } = request.body;
            let transactionId = request.params.tfrId;

            if (transactionId === undefined) {
                [transactionId] = await trx.insert({ date, type }).into('transactions').returning('id');
            }

            const existingSplits = [];

            // Insert the category splits
            await Promise.all(request.body.categories.map(async (split) => {
                if (split.amount !== 0) {
                    let { amount } = split;

                    if (split.id) {
                        existingSplits.push(split.id);

                        const oldSplit = await trx.select('amount').from('transaction_categories').where('id', split.id);

                        amount = split.amount - oldSplit[0].amount;

                        await trx.table('transaction_categories').where('id', split.id).update({ amount: split.amount });
                    }
                    else {
                        const newId = await trx.insert({
                            transaction_id: transactionId,
                            category_id: split.categoryId,
                            amount: split.amount,
                        }).into('transaction_categories').returning('id');

                        existingSplits.push(newId[0]);

                        amount = split.amount;
                    }

                    const category = await Category.findOrFail(split.categoryId, trx);

                    category.amount = parseFloat(category.amount) + amount;

                    await category.save(trx);

                    result.push({ id: category.id, amount: category.amount });
                }
            }));

            // Delete splits that are not in the array of ids
            const query = trx.from('transaction_categories').whereNotIn('id', existingSplits).andWhere('transaction_id', transactionId);
            const toDelete = await query.select('category_id AS categoryId', 'amount');

            await Promise.all(toDelete.map(async (td) => {
                const category = await Category.findOrFail(td.categoryId, trx);

                category.amount = parseFloat(category.amount) - td.amount;

                await category.save(trx);
            }));

            await query.delete();
        }

        await trx.commit();

        return result;
    }

    static async transferDelete({ request }) {
        const trx = await Database.beginTransaction();

        const { tfrId } = request.params;

        const categoryTransfer = await CategoryTransfer.find(tfrId, trx);

        const categorySplits = await categoryTransfer.splits(trx).fetch();

        await Promise.all(categorySplits.rows.map(async (cs) => {
            const category = await Category.find(cs.category_id, trx);

            category.amount -= cs.amount;

            await category.save(trx);

            await cs.delete();
        }));

        await categoryTransfer.delete();

        await trx.commit();
    }

    static async balances({ request, auth }) {
        const { date, id } = request.get();

        return Category.balances(auth.user.id, date, id);
    }
}

module.exports = CategoryController
