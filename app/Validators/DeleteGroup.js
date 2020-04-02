'use strict'

class DeleteGroup {
  get rules () {
    return {
      // validation rules
      groupId: 'empty:categories,group_id'
    }
  }
  
  get data () {
      const requestBody = this.ctx.request.all();
      const groupId = this.ctx.request.params.groupId;

      return Object.assign({}, requestBody, { groupId })
  }
}

module.exports = DeleteGroup
