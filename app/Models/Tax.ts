import { TaxSchema } from '#database/schema'
import { column } from '@adonisjs/lucid/orm'
import type { JSON } from '#types/db'
import { FilingStatus } from '#common/ResponseTypes'

export default class Tax extends TaxSchema {
  @column()
  declare data: JSON<{
    filingStatus: FilingStatus,
    taxableInterest: number,
    qualifiedDividends: number,
    ordinaryDividends: number,
    taxableIraDistributions: number,
    taxablePensionAndAnnuities: number,
    taxableSocialSecurityBenefits: number,
    additionalTaxableIncome: number,
    capitalGains: number,
    longTermCapitalGains: number,
    qualifiedBusinessIncomeDeduction: number,
  }>
}
