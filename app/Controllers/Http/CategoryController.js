'use strict'

const Database = use('Database');


class CategoryController {
    
    async get ({auth}) {
        
        let rows = await Database.select ('g.id AS groupId', 'g.name AS groupName', 'c.id AS categoryId', 'c.name as categoryName', 'amount')
            .table('groups AS g')
            .leftJoin ('categories AS c', 'c.group_id', 'g.id')
            .where ('user_id', auth.user.id)
            .orWhere ('user_id', -1)
            .orderBy('g.name')
            .orderBy('c.name');
                    
        let groups = [];
        let group;

        for (let cat of rows) {
            if (!group) {
                group = { id: cat.groupId, name: cat.groupName, categories: [] };
            } else if (group.name !== cat.groupName) {
                groups.push(group);
                group = { id: cat.groupId, name: cat.groupName, categories: [] };
            }
            
            if (cat.categoryId)
            {
                group.categories.push({ id: cat.categoryId, name: cat.categoryName, amount: cat.amount });
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
    
    async addCategory ({request, auth}) {

        let id = await Database.insert({group_id: request.body.groupId, name: request.body.name}).into('categories').returning('id');
        
        return { groupId: request.body.groupId, id: id[0], name: request.body.name };
    }

    async updateCategory ({request, auth}) {
        
        await Database.table('categories').where({id: request.params.catId}).update({name: request.body.name});

        return { name: request.body.name };
    }
    
    async deleteCategory ({request, auth}) {
        await Database.table('categories').where({id: request.params.catId}).delete ();
    }

    async transactions({request}) {

        let categoryId = parseInt(request.params.catId);

        let result = { transactions: [] };
        
        let balance = await Database.select('amount').table ('categories').where('id', categoryId);

        result.balance = balance[0].amount;
        
        let subquery = Database.select (
                Database.raw('COUNT(CASE WHEN category_id = ' + categoryId + ' THEN 1 ELSE NULL END) AS count'),
                Database.raw("sum(splits.amount) AS sum"),
                Database.raw("json_agg ((" +
                    "'{\"categoryId\": ' || category_id || " +
                    "', \"amount\": ' || splits.amount || " +
                    "', \"category\": ' || '\"' || cats.name || '\"' || " +
                    "', \"group\": ' || '\"' || groups.name || '\"' || " +
                    "'}')::json) AS categories"), "transaction_id")
            .table("category_splits AS splits")
            .join ("categories AS cats", "cats.id", "splits.category_id")
            .join ("groups", "groups.id", "cats.group_id")
            .groupBy ("transaction_id");

        let transactions = await Database.select(
                "trans.id AS id",
                Database.raw("0 AS type"),
                Database.raw("COALESCE(trans.sort_order, 2147483647) AS sort_order"),
                Database.raw("date::text"),
                "trans.name AS name",
                "splits.categories AS categories",
                "inst.name AS institute_name",
                "acct.name AS account_name",
                "trans.amount AS amount")
            .table ('transactions AS trans')
            .join ('accounts AS acct', 'acct.id', 'trans.account_id')
            .join ('institutions AS inst',  'inst.id',  'acct.institution_id')
            .leftJoin(subquery.as('splits'), "splits.transaction_id", "trans.id")
            .where(function () { this.where (-2, categoryId).whereNull('splits.categories')})
            .orWhere('splits.count', '>', 0)
            .orderBy('date', 'desc')
            .orderBy(Database.raw('COALESCE(trans.sort_order, 2147483647)'), 'desc')
            .orderBy('trans.name');

        result.transactions = result.transactions.concat(transactions);

        transactions = await Database.select(
                "xfer.id AS id", 
                Database.raw("1 AS type"), 
                Database.raw("2147483647 AS sort_order"),
                Database.raw("date::text"),
                Database.raw("'Transfer from ' || groups.name || ':' || cat.name AS name"),
                Database.raw("COALESCE(xfer.amount, splits.sum) * -1 AS amount"),
                "categories")
            .table ("category_transfers AS xfer")
            .join ("categories AS cat", "cat.id", "xfer.from_category_id")
            .join ("groups AS groups",  "groups.id", "cat.group_id")
            .leftJoin(subquery.as('splits'), Database.raw("splits.transaction_id * -1"), "xfer.id")
            .where("xfer.from_category_id", categoryId)
            .orWhere(function () { this.where (-2, categoryId).whereNull('splits.categories')})
            .orWhere("splits.count", ">", 0)
            .orderBy('date', 'desc');

        result.transactions = result.transactions.concat(transactions);

        return result;
    }
}

module.exports = CategoryController
