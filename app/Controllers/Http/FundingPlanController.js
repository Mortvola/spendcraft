const Database = use('Database');
const CategoryController = use('App/Controllers/Http/CategoryController')

class FundingPlanController {
    static async getAll({ auth }) {
        return Database.select('id', 'name')
            .from('funding_plans')
            .where('user_id', auth.user.id);
    }

    static async getPlan({ request, auth }) {
        const [{ id, name }] = await Database.select('id', 'name')
            .from('funding_plans')
            .where('id', request.params.planId)
            .andWhere('user_id', auth.user.id);

        const cats = await Database.select(
            'fpc.id AS id',
            'cats.group_id AS groupId',
            'groups.name AS groupName',
            'cats.id AS categoryId',
            'cats.name AS categoryName',
            Database.raw('CAST(COALESCE(fpc.amount, 0) AS float) AS amount'),
        )
            .from('categories AS cats')
            .join('groups', 'groups.id', 'cats.group_id')
            .leftJoin('funding_plan_categories AS fpc',
                'fpc.category_id',
                Database.raw(`cats.id AND fpc.plan_id = ${request.params.planId}`))
            .where('groups.user_id', auth.user.id)
            .andWhere(function() {
                this
                    .where('fpc.plan_id', id)
                    .orWhereNull('fpc.plan_id');
            })
            .orderBy('groups.name')
            .orderBy('cats.name');

        const groups = [];
        let currentGroupName = null;
        let total = 0;

        cats.forEach((c) => {
            if (c.groupName !== currentGroupName) {
                groups.push({ id: c.groupId, name: c.groupName, categories: [] });
                currentGroupName = c.groupName;
            }

            groups[groups.length - 1].categories.push({
                id: c.id,
                categoryId: c.categoryId,
                name: c.categoryName,
                amount: c.amount,
            });

            total += c.amount;
        });

        return {
            id,
            name,
            total,
            groups,
            history: await CategoryController.history({ auth }),
        };
    }

    static async updateCategory({ request }) {
        await Database.table('funding_plan_categories')
            .where('id', request.params.itemId)
            .update('amount', request.body.amount);
    }
}

module.exports = FundingPlanController
