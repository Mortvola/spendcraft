import camelcaseKeys from 'camelcase-keys';
import VanillaSerializer from '@adonisjs/lucid/src/Lucid/Serializers/Vanilla'

export class Serializer extends VanillaSerializer {
  constructor(rows, pages = null, isOne = false) {
    super(rows, pages, isOne);
  }

  toJSON() {
    return camelcaseKeys(super.toJSON());
  }
}
