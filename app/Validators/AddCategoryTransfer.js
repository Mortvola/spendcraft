'use strict'

class AddCategoryTransfer {
    get rules () {
        return {
            // validation rules
            categories: 'required|zeroSum:amount',
            date: 'required'
        }
    }
}

module.exports = AddCategoryTransfer
