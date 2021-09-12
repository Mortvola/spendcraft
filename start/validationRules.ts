/*
|--------------------------------------------------------------------------
| Preloaded File
|--------------------------------------------------------------------------
|
| Any code written inside this file will be executed during the application
| boot.
|
*/
import { validator } from '@ioc:Adonis/Core/Validator'
import Database from '@ioc:Adonis/Lucid/Database';

validator.rule(
  'empty',
  async (value, [{ table, column}], { pointer, arrayExpressionPointer, errorReporter }) => {
    /**
     * Skip validation when value is not a string. The string
     * schema rule will handle it
     */
    if (typeof (value) !== 'number') {
      return
    }

    const exists = await Database.query()
      .select(Database.raw('EXISTS (SELECT 1 FROM ?? WHERE ?? = ?) AS exists', [table, column, value]));

    if (exists[0].exists) {
      errorReporter.report(pointer, 'empty', `Rows of ${table} exists where ${column} = ${value}`, arrayExpressionPointer)
    }
  },
  (_options) => {
    return {
      async: true,
    }
  }
)

validator.rule(
  'zeroSum',
  async (values: Array<any>, [{ property }], { pointer, arrayExpressionPointer, errorReporter }) => {
    /**
     * Skip validation when value is not a string. The string
     * schema rule will handle it
     */
    if (!Array.isArray(values)) {
      return;
    }

    let sum = 0;
    values.forEach((v) => {
        sum += Math.round(v[property] * 100);
    });

    if (sum !== 0) {
      errorReporter.report(pointer, 'nonZeroSum', `Rows do not sum to zero`, arrayExpressionPointer)
    }
  },
  (_options) => {
    return {
      async: true,
    }
  }
)
