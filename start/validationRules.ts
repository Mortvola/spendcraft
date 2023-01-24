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


validator.rule(
  'password',
  (value, _, options) => {
    if (typeof value !== 'string') {
      return
    }

    if (value.length < 8) {
      options.errorReporter.report(
        options.pointer,
        'password.minimum', 
        'Passwords must be at least 8 characters.',
        options.arrayExpressionPointer)
    }

    if (value.length > 64) {
      options.errorReporter.report(
        options.pointer,
        'password.maximum', 
        'Passwords must be no longer than 64 characters.',
        options.arrayExpressionPointer)
    }

    if (!/(?=.*?[A-Z])/.test(value)) {
      options.errorReporter.report(
        options.pointer,
        'password.upper', 
        'Passwords must contain at least one uppercase letter.',
        options.arrayExpressionPointer)
    }

    if (!/(?=.*?[a-z])/.test(value)) {
      options.errorReporter.report(
        options.pointer,
        'password.lower', 
        'Passwords must contain at least one lowercase letter.',
        options.arrayExpressionPointer)
    }
    
    if (!/(?=.*?[0-9])/.test(value)) {
      options.errorReporter.report(
        options.pointer,
        'password.digit', 
        'Passwords must contain at least one digit.',
        options.arrayExpressionPointer)
    }
  }
)
