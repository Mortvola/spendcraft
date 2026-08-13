import { FilingStatus } from '#common/ResponseTypes'
import vine from '@vinejs/vine'

export const addTax = vine.create(
  vine.object({
    year: vine.number(),
    forecast: vine.object({
      filingStatus: vine.enum(FilingStatus),
      taxableInterest: vine.number(),
      qualifiedDividends: vine.number(),
      ordinaryDividends: vine.number(),
      taxableIraDistributions: vine.number(),
      taxablePensionAndAnnuities: vine.number(),
      taxableSocialSecurityBenefits: vine.number(),
      additionalTaxableIncome: vine.number(),
      shortTermCapitalGains: vine.number(),
      longTermCapitalGains: vine.number(),
      qualifiedBusinessIncomeDeduction: vine.number(),
    }),
  }),
)
