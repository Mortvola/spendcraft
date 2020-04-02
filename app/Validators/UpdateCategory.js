'use strict'

class UpdateCategory {
    get rules () {
        const groupId = this.ctx.request.params.groupId;
        const catId = this.ctx.request.params.catId;
        
        return {
            // validation rules
            name: `required|uniqueWithin:categories,name,group_id,${groupId},id,${catId}`
        }
    }
}

module.exports = UpdateCategory
