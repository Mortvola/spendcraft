'use strict'

const Database = use('Database');
const Category = use('App/Models/Category');

class CategoryController {
    
    async get ({auth}) {
        
        let rows = await Database.select ('g.id AS groupId', 'g.name AS groupName', 'c.id AS categoryId', 'c.name as categoryName', 'amount')
            .from('groups AS g')
            .leftJoin ('categories AS c', 'c.group_id', 'g.id')
            .where ('user_id', auth.user.id)
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

    async transactions({request, auth}) {

        let categoryId = parseInt(request.params.catId);

        let result = { transactions: [] };
        
        let cat = await Database.select('amount', 'cats.name AS name', 'cats.system AS system')
            .from ('categories AS cats')
            .join ('groups', 'groups.id', 'group_id')
            .where('cats.id', categoryId)
            .andWhere('groups.user_id', auth.user.id);

        result.balance = cat[0].amount;
        
        let subquery = Database.select (
                Database.raw('COUNT(CASE WHEN category_id = ' + categoryId + ' THEN 1 ELSE NULL END) AS count'),
                Database.raw("sum(splits.amount) AS sum"),
                Database.raw("json_agg ((" +
                    "'{\"categoryId\": ' || category_id || " +
                    "', \"amount\": ' || splits.amount || " +
                    "', \"category\": ' || '\"' || cats.name || '\"' || " +
                    "', \"group\": ' || '\"' || groups.name || '\"' || " +
                    "', \"id\": ' || '\"' || splits.id || '\"' ||" +
                    "'}')::json) AS categories"),
                "transaction_id")
            .from("category_splits AS splits")
            .join ("categories AS cats", "cats.id", "splits.category_id")
            .join ("groups", "groups.id", "cats.group_id")
            .where('groups.user_id', auth.user.id)
            .groupBy ("transaction_id");

        let query = Database.select(
                "trans.id AS id",
                Database.raw("0 AS type"),
                Database.raw("COALESCE(trans.sort_order, 2147483647) AS sort_order"),
                Database.raw("date::text"),
                "trans.name AS name",
                "splits.categories AS categories",
                "inst.name AS institute_name",
                "acct.name AS account_name",
                "trans.amount AS amount")
            .from ('transactions AS trans')
            .join ('accounts AS acct', 'acct.id', 'trans.account_id')
            .join ('institutions AS inst',  'inst.id',  'acct.institution_id')
            .leftJoin(subquery.as('splits'), "splits.transaction_id", "trans.id")
            .where('inst.user_id', auth.user.id)
            .orderBy('date', 'desc')
            .orderBy(Database.raw('COALESCE(trans.sort_order, 2147483647)'), 'desc')
            .orderBy('trans.name');

        if (cat[0].system && cat[0].name == 'Unassigned') {
            query.whereNull('splits.categories');
        }
        else {
            query.where('splits.count', '>', 0);
        }
        
        result.transactions = await query;

        // Get the category transfers (we don't transfer to or from unassigned)
        if (!cat[0].system || cat[0].name != 'Unassigned') {

            // Category transfers
            query = Database.select(
                    "xfer.id AS id", 
                    Database.raw("1 AS type"), 
                    Database.raw("2147483647 AS sort_order"),
                    Database.raw("date::text"),
                    Database.raw("'Category Transfer' AS name"),
                    Database.raw("splits.sum * -1 AS amount"),
                    "splits.categories AS categories")
                .from ("category_transfers AS xfer")
                .leftJoin(subquery.as('splits'), Database.raw("splits.transaction_id * -1"), "xfer.id")
                .where('splits.count', '>', 0)
                .orderBy('date', 'desc');

            let transactions = await query;

            result.transactions = result.transactions.concat(transactions);
        }

        return result;
    }
    
    async transfer ({request, auth}) {
        
        let trx = await Database.beginTransaction ();
        
        let result = [];
        
        if (Array.isArray(request.body.categories)) {
            
            let date = request.body.date;
            let transactionId;
            
            if (request.params.tfrId == undefined) {
                let xfr = await trx.insert({date: date}).into('category_transfers').returning('id');
                
                // In the splits table, negative transaction IDs refer to the category_transfers table entries.
                transactionId = -xfr[0];
            }
            else {
                transactionId = -request.params.tfrId;
            }

            let existingSplits = [];
            
            // Insert the category splits
            for (let split of request.body.categories) {
                
                if (split.amount != 0) {
                    
                    let amount = split.amount;
                    
                    if (split.id) {
                        existingSplits.push(split.id);
                        
                        let oldSplit = await trx.select('amount').from('category_splits').where('id', split.id);
                        
                        amount = split.amount - oldSplit[0].amount;
                        
                        await trx.table('category_splits').where('id', split.id).update({amount: split.amount});
                    }
                    else {
                        
                        let newId = await trx.insert({transaction_id: transactionId, category_id: split.categoryId, amount: split.amount}).into ('category_splits').returning('id');
                        
                        existingSplits.push(newId[0]);
                        
                        amount = split.amount;
                    }
                    
                    const category = await Category.findOrFail(split.categoryId, trx);
                    
                    category.amount = parseFloat(category.amount) + amount;

                    await category.save(trx);
                    
                    result.push({id: category.id, amount: category.amount});
                }
            }
            
            // Delete splits that are not in the array of ids
            let query = trx.from('category_splits').whereNotIn('id', existingSplits).andWhere('transaction_id', transactionId);
            let toDelete = await query.select('category_id AS categoryId', 'amount');
            
            for (let td of toDelete) {

                const category = await Category.findOrFail(td.categoryId, trx);
                
                category.amount = parseFloat(category.amount) - td.amount;

                await category.save(trx);
            }
            
            await query.delete ();
            
        }
            
        await trx.commit ();

        return result;
    }
}

module.exports = CategoryController
