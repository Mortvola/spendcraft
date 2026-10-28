import { FilingStatus } from '#common/ResponseTypes'
import vine from '@vinejs/vine'
import { monetaryAmount } from '../monetaryAmount.js'

export const addTax = vine.create(
  vine.object({
    year: vine.number(),
    forecast: vine.object({
      filingStatus: vine.enum(FilingStatus),
      taxableInterest: monetaryAmount(),
      qualifiedDividends: monetaryAmount(),
      ordinaryDividends: monetaryAmount(),
      taxableIraDistributions: monetaryAmount(),
      taxablePensionAndAnnuities: monetaryAmount(),
      taxableSocialSecurityBenefits: monetaryAmount(),
      additionalTaxableIncome: monetaryAmount(),
      shortTermCapitalGains: monetaryAmount(),
      longTermCapitalGains: monetaryAmount(),
      qualifiedBusinessIncomeDeduction: monetaryAmount(),
      estimated: vine.object({
        expectedAgi: monetaryAmount(),
        priorYearAgi: monetaryAmount(),
        priorYearTotalTax: monetaryAmount(),
      }).optional()
    }),
  }),
)
