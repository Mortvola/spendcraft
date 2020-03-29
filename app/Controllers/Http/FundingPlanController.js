'use strict'

const Database = use('Database');


class FundingPlanController {
    
    async getAll () {
        
        let plans = await Database.select ('id', 'name').from('funding_plans');

        return plans;
    }
    
    async getPlan ({request}) {
        let plan = await Database.select ('id', 'name').from('funding_plans').where('id', request.params.planId);
        
        let cats = await Database.select (
                    "fpc.id AS id", "cats.group_id AS groupId", "groups.name AS groupName",
                    "cats.id AS categoryId", "cats.name AS categoryName", "fpc.amount AS amount")
            .from('categories AS cats')
            .join('groups', "groups.id", "cats.group_id")
            .leftJoin('funding_plan_categories AS fpc', "fpc.category_id", Database.raw("cats.id AND fpc.plan_id = " + request.params.planId))
            .orderBy("groups.name")
            .orderBy("cats.name");
        
        return { id: plan[0].id, name: plan[0].name, categories: cats };
    }
}

module.exports = FundingPlanController
