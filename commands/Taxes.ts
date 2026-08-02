import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

enum FilingStatus {
  Single,
  MarriedFilingSeparate,
  MarriedFilingJointly,
  HeadOfHousehold,
}

export default class Taxes extends BaseCommand {
  static commandName = 'taxes'
  static description = ''

  static options: CommandOptions = {}

  taxMap = new Map<number, { tax: number, amount: number}>()

  static getTaxBrackets(filingStatus: FilingStatus): { rate: number, startAmount: number }[] {
    switch (filingStatus) {
      case FilingStatus.Single:
        return [
            { rate : 10, startAmount : 0 },
            { rate : 12, startAmount : 11925 },
            { rate : 22, startAmount : 48475 },
            { rate : 24, startAmount : 103350 },
            { rate : 32, startAmount : 197300 },
            { rate : 35, startAmount : 250525 },
            { rate : 37, startAmount : 626350 }
        ]

      case FilingStatus.MarriedFilingSeparate:
        return [
            { rate : 10, startAmount : 0 },
            { rate : 12, startAmount : 11925 },
            { rate : 22, startAmount : 48475 },
            { rate : 24, startAmount : 103350 },
            { rate : 32, startAmount : 197300 },
            { rate : 35, startAmount : 250525 },
            { rate : 37, startAmount : 375800 }
        ]

      case FilingStatus.MarriedFilingJointly:
        return [
          { rate : 10, startAmount : 0 },
          { rate : 12, startAmount : 23850 },
          { rate : 22, startAmount : 96950 },
          { rate : 24, startAmount : 206700 },
          { rate : 32, startAmount : 394600 },
          { rate : 35, startAmount : 501050 },
          { rate : 37, startAmount : 751600 }
        ]

      case FilingStatus.HeadOfHousehold:
        return [
            { rate : 10, startAmount : 0 },
            { rate : 12, startAmount : 17000 },
            { rate : 22, startAmount : 64850 },
            { rate : 24, startAmount : 103350 },
            { rate : 32, startAmount : 197300 },
            { rate : 35, startAmount : 250525 },
            { rate : 37, startAmount : 626350 }
        ]
    }
  }

  computeTax(income: number, filingStatus: FilingStatus): number {
    let taxes = 0;

    const taxBrackets = Taxes.getTaxBrackets(filingStatus);

    for (let i = 0; i < taxBrackets.length - 1; i += 1) {
      const amount = Math.min(income, taxBrackets[i + 1].startAmount) - taxBrackets[i].startAmount
      const tax = amount * (taxBrackets[i].rate / 100.0)

      taxes += tax;
    
      let record = this.taxMap.get(taxBrackets[i].rate);

      if (!record) {
        record = { tax, amount }
        this.taxMap.set(taxBrackets[i].rate, record)
      } else {      
        record.amount += amount
        record.tax += tax
      }
    
      if (income < taxBrackets[i + 1].startAmount) {
        break;
      }
    }

    return taxes;
  }

  static getStandardDeduction(filingStatus: FilingStatus): number {
    switch (filingStatus) {
      case FilingStatus.Single:
        return 15750;
      case FilingStatus.MarriedFilingSeparate:
        return 15000;
      case FilingStatus.MarriedFilingJointly:
        return 31500;
      case FilingStatus.HeadOfHousehold:
        return 23625;
    }
  }

  static getMaxZeroPctTaxableIncome(filingStatus: FilingStatus): number {
    switch (filingStatus) {
      case FilingStatus.Single:
      case FilingStatus.MarriedFilingSeparate:
        return 48350;
      case FilingStatus.MarriedFilingJointly:
        return 96700;
      case FilingStatus.HeadOfHousehold:
        return 64750;
    }
  }

  static getMaxFifteenPctTaxableIncome(filingStatus: FilingStatus): number {
    switch (filingStatus) {
      case FilingStatus.Single:
        return 533400;
      case FilingStatus.MarriedFilingSeparate:
        return 300000;
      case FilingStatus.MarriedFilingJointly:
        return 600050;
      case FilingStatus.HeadOfHousehold:
        return 566700;
    }
  }

  async run() {
    const filingStatus = FilingStatus.MarriedFilingJointly;

    const taxableInterest = 371;
    const ordinaryDividends = 26614;
    const taxableIraDistributions = 75000;
    const taxablePensionAndAnnuities = 0;
    const taxableSocialSecurityBenefits = 12079;
    const capitalGains = 145209;
    const additionalTaxableIncome = 0;

    const qualifiedDividends = 5686;
    const longTermCapitalGains = 145209

    const totalIncome = taxableInterest + ordinaryDividends + taxableIraDistributions
      + taxablePensionAndAnnuities + taxableSocialSecurityBenefits + capitalGains + additionalTaxableIncome;

    const adjustmentsToIncome = 0;

    const adjustedGrossIncome = totalIncome - adjustmentsToIncome;

    const taxableIncome = adjustedGrossIncome - Taxes.getStandardDeduction(filingStatus);

    const dividendsAndGains = qualifiedDividends + longTermCapitalGains;

    const line10 = Math.min(taxableIncome, dividendsAndGains)

    // line 5
    const regularTaxableIncome = Math.max(taxableIncome - dividendsAndGains, 0);

    // Compute 0% taxes
    const maxNonTaxableIncome = Taxes.getMaxZeroPctTaxableIncome(filingStatus);

    const line7 = Math.min(taxableIncome, maxNonTaxableIncome);

    // line 9
    const zeroPctTaxedAmount = line7 - Math.min(line7, regularTaxableIncome);
    this.taxMap.set(0, { amount: zeroPctTaxedAmount, tax: 0 })

    // Compute 15% taxes
    const line12 = line10 - zeroPctTaxedAmount

    const line13 = Taxes.getMaxFifteenPctTaxableIncome(filingStatus);

    const line14 = Math.min(taxableIncome, line13)

    const line15 = regularTaxableIncome + zeroPctTaxedAmount

    const line16 = line14 - line15;

    const fifteenPctTaxedAmount = Math.min(line12, line16)

    if (fifteenPctTaxedAmount) {
      const fifteenPctTaxes = fifteenPctTaxedAmount * 0.15;
      this.taxMap.set(15, { amount: fifteenPctTaxedAmount, tax: fifteenPctTaxes })
    }

    // Compute 20% taxes
    const twentyPctTaxedAmount = line10 - (zeroPctTaxedAmount + fifteenPctTaxedAmount);

    if (twentyPctTaxedAmount > 0) {
      const twentyPctTaxes = twentyPctTaxedAmount * 0.20;
      this.taxMap.set(20, { amount: twentyPctTaxedAmount, tax: twentyPctTaxes })
    }

    // Compute regular tax rate
    this.computeTax(regularTaxableIncome, filingStatus)

    const sortedEntries = [...this.taxMap.entries()].sort((a, b) => (a[0] - b[0]))

    let totalTaxes = 0
    let totalTaxedAmount = 0
    let marginalTaxRate = 0

    for (const [rate, record] of sortedEntries) {
      console.log(`rate: ${rate}%, amount: ${record.amount}, tax: ${record.tax}`)
      totalTaxes += record.tax
      totalTaxedAmount += record.amount

      if (record.tax > 0) {
        marginalTaxRate = rate
      }
    }

    console.log(`total amount: ${totalTaxedAmount}, total taxes: ${totalTaxes}, marginal tax rate: ${marginalTaxRate}, effective tax rate: ${totalTaxes / totalTaxedAmount * 100.0}`)
  }
}