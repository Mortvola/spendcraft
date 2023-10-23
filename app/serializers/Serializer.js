// eslint-disable-next-line @typescript-eslint/no-var-requires
const camelcaseKeys = require('camelcase-keys');
// eslint-disable-next-line @typescript-eslint/no-var-requires
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
