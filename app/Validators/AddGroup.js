'use strict'

class AddGroup {
  get rules () {
    return {
      // validation rules
      name: 'required|unique:groups,name'
    }
  }
}

module.exports = AddGroup
