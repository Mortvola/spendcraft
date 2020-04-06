'use strict'

class UpdateCategoryTransfer {
    get rules () {
        return {
            // validation rules
            categories: 'required|zeroSum:amount',
            date: 'required'
        }
    }
}

module.exports = UpdateCategoryTransfer
