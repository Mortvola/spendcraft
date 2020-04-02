'use strict'

class UpdateGroup {
    get rules () {
        const groupId = this.ctx.request.params.groupId;

        return {
            // validation rules
            name: `required|unique:groups,name,id,${groupId}`
        }
    }
}

module.exports = UpdateGroup
