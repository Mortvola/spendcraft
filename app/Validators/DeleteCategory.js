'use strict'

class DeleteCategory {
  get rules () {
      
    return {
        // validation rules
        catId: 'empty:category_splits,category_id'
    }
  }

  get data () {
      const requestBody = this.ctx.request.all();
      const catId = this.ctx.request.params.catId;

      return Object.assign({}, requestBody, { catId })
  }
}

module.exports = DeleteCategory
