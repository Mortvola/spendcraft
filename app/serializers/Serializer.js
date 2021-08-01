const camelcaseKeys = require('camelcase-keys');
const VanillaSerializer = require('@adonisjs/lucid/src/Lucid/Serializers/Vanilla')

class Serializer extends VanillaSerializer {
  constructor(rows, pages = null, isOne = false) {
    super(rows, pages, isOne);
  }

  toJSON() {
    return camelcaseKeys(super.toJSON());
  }
}

module.exports = Serializer;
