import { decodeStoredMonetaryAmount } from '#services/categoryAmountCodec';
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';

const canonicalAmount = vine.createRule((value, _options: undefined, field) => {
  try { decodeStoredMonetaryAmount(value) }
  catch { field.report('The {{ field }} field must be a safe canonical two-decimal monetary string', 'decimalMoney', field) }
});

const statementAmount = () => vine.string().use(canonicalAmount()).transform(decodeStoredMonetaryAmount);

export const addStatement = vine.create(
  vine.object({
    startDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    endDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    startingBalance: statementAmount(),
    endingBalance: statementAmount(),
    data: vine.object({
      shortTermCapitalGains: statementAmount(),
      longTermCapitalGains: statementAmount(),
      dividends: statementAmount(),
      taxableInterest: statementAmount(),
    }).optional()
  }),
)

export const updateStatement = vine.create(
  vine.object({
    startDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    endDate: vine.date().optional().transform((value) => DateTime.fromJSDate(value)),
    startingBalance: statementAmount().optional(),
    endingBalance: statementAmount().optional(),
    reconcile: vine.string().optional(),
    data: vine.object({
      shortTermCapitalGains: statementAmount(),
      longTermCapitalGains: statementAmount(),
      dividends: statementAmount(),
      taxableInterest: statementAmount(),
    }).optional()
  }),
)
