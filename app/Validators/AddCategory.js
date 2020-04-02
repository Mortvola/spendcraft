'use strict'

class AddCategory {
  get rules () {
      
        const groupId = this.ctx.request.body.groupId
      
        return {
            // validation rules
            name: `required|uniqueWithin:categories,name,group_id,${groupId}`
        }
  }
}

module.exports = AddCategory
