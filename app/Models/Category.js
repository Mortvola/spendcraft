/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model');
const Database = use('Database');

class Category extends Model {
    static async balances(userId, date) {
        const transactionsSubquery = Database.select(
            'category_id',
            'splits.amount',
        )
            .from('category_splits AS splits')
            .join('transactions', 'transactions.id', 'splits.transaction_id')
            .where('transactions.date', '>', date);

        const transfersSubquery = Database.select(
            'category_id',
            'splits.amount',
        )
            .from('category_splits AS splits')
            .join('category_transfers', 'category_transfers.id', 'splits.transaction_id')
            .where('category_transfers.date', '>', date);

        const rows = await Database.select(
            'groups.id AS groupId',
            'groups.name AS groupName',
            'categories.id as categoryId',
            'categories.name as categoryName',
            Database.raw('categories.amount - COALESCE(sum(splits1.amount) + sum(splits2.amount), 0) AS balance'),
        )
            .from('groups')
            .join('categories', 'categories.group_id', 'groups.id')
            .leftJoin(transactionsSubquery.as('splits1'), 'splits1.category_id', 'categories.id')
            .leftJoin(transfersSubquery.as('splits2'), 'splits2.category_id', 'categories.id')
            .where('groups.user_id', userId)
            .groupBy('groups.id', 'groups.name', 'categories.id', 'categories.name')
            .orderBy('groups.name')
            .orderBy('categories.name');

        const groups = [];
        let group;

        rows.forEach((cat) => {
            if (!group) {
                group = { id: cat.groupId, name: cat.groupName, categories: [] };
            }
            else if (group.name !== cat.groupName) {
                groups.push(group);
                group = { id: cat.groupId, name: cat.groupName, categories: [] };
            }

            if (cat.categoryId) {
                group.categories.push({
                    id: cat.categoryId,
                    name: cat.categoryName,
                    balance: parseFloat(cat.balance),
                });
            }
        });

        if (group) {
            groups.push(group);
        }

        return groups;
    }
}

module.exports = Category
