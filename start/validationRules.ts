/*
|--------------------------------------------------------------------------
| Preloaded File
|--------------------------------------------------------------------------
|
| Any code written inside this file will be executed during the application
| boot.
|
*/
import db from '@adonisjs/lucid/services/db';
import vine, { SimpleMessagesProvider, VineDate, VineNumber } from '@vinejs/vine'
import { FieldContext } from '@vinejs/vine/types';
import { VineDbSearchOptions } from '@adonisjs/lucid/types/vine';
import { DateTime } from 'luxon';
import { JSONAPIErrorReporter } from '#app/validation/JSONAPIErrorReporter';

vine.errorReporter = () => new JSONAPIErrorReporter()

vine.messagesProvider = new SimpleMessagesProvider({
  'username.unique': 'An account with the requested username already exists',
  'username.required': 'A username is required',
  'email.email': 'A valid email address must be provided',
  'email.required': 'An email address is required',
  'email.unique': 'An account with the requested email address already exists',
  'name.unique': 'The {{ field }} must be unique',
})

async function unique(
  value: unknown,
  options: VineDbSearchOptions<DateTime>,
  field: FieldContext
) {
  /**
   * We do not want to deal with non-string
   * values. The "string" rule will handle the
   * the validation.
   */
  if (typeof value !== 'string') {
    return
  }

  const query = db
    .from(options.table)
    .select(options.column)
    .where(options.column, value)

  if (options.filter) {
    options.filter(query, (value as unknown) as DateTime, field)
  }
  
  const row = await query.first()

  if (row) {
    field.report(
      'The {{ field }} field is not unique',
      'unique',
      field,
    )
  }
}

const uniqueRule = vine.createRule(unique)

declare module '@vinejs/vine' {
  interface VineDate {
    unique(options: VineDbSearchOptions<DateTime>): this,
  }
}

VineDate.macro('unique', function (this: VineDate, options: VineDbSearchOptions<DateTime>) {
  return this.use(uniqueRule(options))
})

async function notExists(
  value: unknown,
  options: { table: string, column: string},
  field: FieldContext
) {
  /**
   * We do not want to deal with non-string
   * values. The "string" rule will handle the
   * the validation.
   */
  if (typeof value !== 'number') {
    return
  }

  const result = await db.query()
    .select(db.raw('EXISTS (SELECT 1 FROM ?? WHERE ?? = ?) AS exists', [options.table, options.column, value]))
    .first();

  if (result.exists) {
    field.report(
      'Rows of ??? {{ field }} exists where ?? = ??',
      'notExists',
      field,
    )
  }
}

const notExistsRule = vine.createRule(notExists)

declare module '@vinejs/vine' {
  interface VineNumber {
    notExists(options: { table: string, column: string }): this,
  }
}

VineNumber.macro('notExists', function (this: VineNumber, options: { table: string, column: string }) {
  return this.use(notExistsRule(options))
})

async function transactionsExist(
  value: unknown,
  _options: unknown,
  field: FieldContext
) {
  /**
   * We do not want to deal with non-string
   * values. The "string" rule will handle the
   * the validation.
   */
  if (typeof value !== 'number') {
    return
  }

  const result = await db.query()
    .select(1)
    .from('transactions')
    .where('deleted', false)
    .whereRaw('categories::jsonb @\\? (\'$[*] \\? (@.categoryId == \' || ? || \' && @.amount != 0)\')::jsonpath', [value])
    .first();

  if (result) {
    field.report(
      'The {{ field }} field has assigned transactions',
      'transactionsExist',
      field,
    )
  }
}

const transactionsExistRule = vine.createRule(transactionsExist)

declare module '@vinejs/vine' {
  interface VineNumber {
    transactionsExist(): this,
  }
}

VineNumber.macro('transactionsExist', function (this: VineNumber) {
  return this.use(transactionsExistRule())
})


// async function zeroSum(
//   value: unknown,
//   _options: unknown,
//   field: FieldContext
// ) {
//   /**
//    * We do not want to deal with non-string
//    * values. The "string" rule will handle the
//    * the validation.
//    */
//   if (typeof value !== 'number') {
//     return
//   }

//   let sum = 0;
//   values.forEach((v) => {
//       sum += Math.round(v[property] * 100);
//   });

//   if (sum !== 0) {
//     errorReporter.report(pointer, 'nonZeroSum', `Rows do not sum to zero: ${sum}`, arrayExpressionPointer)
//   }
// }
