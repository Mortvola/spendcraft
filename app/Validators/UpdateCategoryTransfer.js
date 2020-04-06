'use strict'

class UpdateCategoryTransfer {
    get rules () {
        return {
            // validation rules
            categories: 'required|validCategory|!allZero:amount|zeroSum:amount',
            date: 'required|date'
        }
    }
}

module.exports = UpdateCategoryTransfer
