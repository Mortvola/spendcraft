import { TaxSchema } from '#database/schema'
import { column, beforeSave, afterSave } from '@adonisjs/lucid/orm'
import type { JSON } from '#types/db'
import { FilingStatus } from '#common/ResponseTypes'

import { serializeTaxForecast } from '#services/taxMonetaryCodec'
import { consumeTaxForecast, prepareTaxForecast, stageTaxMoneySave, finishTaxMoneySave } from
  '#services/taxMonetaryStorage'

export default class Tax extends TaxSchema {
  @beforeSave()
  public static stageMoney(row: Tax) { stageTaxMoneySave(row) }

  @afterSave()
  public static finishMoney(row: Tax) { finishTaxMoneySave(row, 'data') }

  @column({
    consume: (value, _key, row) => consumeTaxForecast(value, row),
    prepare: (value, _key, row) => prepareTaxForecast(value, row),
    serialize: value => serializeTaxForecast(value),
  })
  declare data: JSON<{
    filingStatus: FilingStatus,
    taxableInterest: number,
    qualifiedDividends: number,
    ordinaryDividends: number,
    taxableIraDistributions: number,
    taxablePensionAndAnnuities: number,
    taxableSocialSecurityBenefits: number,
    additionalTaxableIncome: number,
    shortTermCapitalGains: number,
    longTermCapitalGains: number,
    qualifiedBusinessIncomeDeduction: number,
    estimated?: {
      expectedAgi: number,
      priorYearAgi: number,
      priorYearTotalTax: number,
    }
  }>
}
