import Http from "@mortvola/http";
import { computed, observable, runInAction } from "mobx";
import { ApiResponse, FilingStatus, TaxProps } from "../../common/ResponseTypes";
import { DateTime } from "luxon";

export interface TaxBracketEntry { tax: number, amount: number }

export interface TaxResults {
  brackets: [number, TaxBracketEntry][],
  totalTaxedAmount: number,
  totalTaxes: number,
  marginalTaxRate: number,
  effectiveTaxRate: number,
}

type TaxMap = Map<number, TaxBracketEntry>;

export default class Taxes {
  @observable
  accessor filingStatus = FilingStatus.MarriedFilingJointly;

  @observable
  accessor taxableInterest = 0;

  @observable
  accessor actualTaxableInterest = 0;

  @observable
  accessor taxablePensionAndAnnuities = 0;
  
  @observable
  accessor taxableSocialSecurityBenefits = 0;

  @observable
  accessor additionalTaxableIncome = 0;

  @observable
  accessor taxableIraDistributions = 0;

  @observable
  accessor qualifiedDividends = 0;

  @observable
  accessor ordinaryDividends = 0;

  @observable
  accessor actualOridinaryDividends = 0;

  @computed
  get capitalGains() {
    const gains = this.shortTermCapitalGains + this.longTermCapitalGains
      + this.actualShortTermCapitalGains + this.actualLongTermCapitalGains

    if (gains < 0) {
      return Math.max(gains, this.filingStatus === FilingStatus.MarriedFilingSeparate ? -1500 : -3000)
    }

    return gains;
  }

  @observable
  accessor shortTermCapitalGains = 0;

  @observable
  accessor actualShortTermCapitalGains = 0;

  @observable
  accessor longTermCapitalGains = 0;

  @observable
  accessor actualLongTermCapitalGains = 0;

  @observable
  accessor qualifiedBusinessIncomeDeduction = 0;

  @computed
  get totalIncome() {
    return this.taxableInterest + this.ordinaryDividends + this.taxableIraDistributions
      + this.taxablePensionAndAnnuities + this.taxableSocialSecurityBenefits + this.capitalGains + this.additionalTaxableIncome
      + this.actualTaxableInterest + this.actualOridinaryDividends;
  }

  @computed
  get standardDeduction() {
    return Taxes.getStandardDeduction(this.filingStatus)
  }

  @computed
  get taxableIncome() {
    const adjustmentsToIncome = 0;

    const adjustedGrossIncome = this.totalIncome - adjustmentsToIncome;

    return Math.max(adjustedGrossIncome - (this.standardDeduction + this.qualifiedBusinessIncomeDeduction), 0);
  }

  async load() {
    const response = await Http.get<ApiResponse<TaxProps>>('/api/v1/taxes/2026');

    if (response.ok) {
      const { data } = await response.body();

      if (data) {
        runInAction(() => {
          this.filingStatus = data.forecast?.filingStatus ?? FilingStatus.Single;
          this.taxableInterest = data.forecast?.taxableInterest ?? 0;
          this.qualifiedDividends = data.forecast?.qualifiedDividends ?? 0;
          this.ordinaryDividends = data.forecast?.ordinaryDividends ?? 0;
          this.taxableIraDistributions = data.forecast?.taxableIraDistributions ?? 0;
          this.taxablePensionAndAnnuities = data.forecast?.taxablePensionAndAnnuities ?? 0;
          this.taxableSocialSecurityBenefits = data.forecast?.taxableSocialSecurityBenefits ?? 0;
          this.additionalTaxableIncome = data.forecast?.additionalTaxableIncome ?? 0;
          this.shortTermCapitalGains = data.forecast?.shortTermCapitalGains ?? 0;
          this.longTermCapitalGains = data.forecast?.longTermCapitalGains ?? 0;
          this.qualifiedBusinessIncomeDeduction = data.forecast?.qualifiedBusinessIncomeDeduction ?? 0;

          this.actualTaxableInterest = data.actuals?.taxableInterest ?? 0;
          this.actualOridinaryDividends = data.actuals?.ordinaryDividends ?? 0;
          this.actualShortTermCapitalGains = data.actuals?.shortTermCapitalGains ?? 0;
          this.actualLongTermCapitalGains = data.actuals?.longTermCapitalGains ?? 0;
        })
      }
    }
  }

  async save() {
    const response = await Http.post<TaxProps, ApiResponse<TaxProps>>('/api/v1/taxes', {
      year: 2026,
      forecast: {
        filingStatus: this.filingStatus,
        taxableInterest: this.taxableInterest,
        qualifiedDividends: this.qualifiedDividends,
        ordinaryDividends: this.ordinaryDividends,
        taxableIraDistributions: this.taxableIraDistributions,
        taxablePensionAndAnnuities: this.taxablePensionAndAnnuities,
        taxableSocialSecurityBenefits: this.taxableSocialSecurityBenefits,
        additionalTaxableIncome: this.additionalTaxableIncome,
        shortTermCapitalGains: this.shortTermCapitalGains,
        longTermCapitalGains: this.longTermCapitalGains,
        qualifiedBusinessIncomeDeduction: this.qualifiedBusinessIncomeDeduction,
      }
    })

    if (response.ok) {
      const { data } = await response.body();

      if (data) {
        runInAction(() => {
          this.filingStatus = data.forecast?.filingStatus ?? FilingStatus.Single;
          this.taxableInterest = data.forecast?.taxableInterest ?? 0;
          this.qualifiedDividends = data.forecast?.qualifiedDividends ?? 0;
          this.ordinaryDividends = data.forecast?.ordinaryDividends ?? 0;
          this.taxableIraDistributions = data.forecast?.taxableIraDistributions ?? 0;
          this.taxablePensionAndAnnuities = data.forecast?.taxablePensionAndAnnuities ?? 0;
          this.taxableSocialSecurityBenefits = data.forecast?.taxableSocialSecurityBenefits ?? 0;
          this.additionalTaxableIncome = data.forecast?.additionalTaxableIncome ?? 0;
          this.shortTermCapitalGains = data.forecast?.shortTermCapitalGains ?? 0;
          this.longTermCapitalGains = data.forecast?.longTermCapitalGains ?? 0;
          this.qualifiedBusinessIncomeDeduction = data.forecast?.qualifiedBusinessIncomeDeduction ?? 0;

          this.actualTaxableInterest = data.actuals?.taxableInterest ?? 0;
          this.actualOridinaryDividends = data.actuals?.ordinaryDividends ?? 0;
          this.actualShortTermCapitalGains = data.actuals?.shortTermCapitalGains ?? 0;
          this.actualLongTermCapitalGains = data.actuals?.longTermCapitalGains ?? 0;
        })
      }
    }
  }

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

  computeTax(income: number, taxMap: TaxMap): number {
    let taxes = 0;

    const taxBrackets = Taxes.getTaxBrackets(this.filingStatus);

    for (let i = 0; i < taxBrackets.length; i += 1) {
      const upperBound = i < taxBrackets.length - 1 ? taxBrackets[i + 1].startAmount : Infinity;

      const amount = Math.min(income, upperBound) - taxBrackets[i].startAmount
      const tax = amount * (taxBrackets[i].rate / 100.0)

      if (tax > 0) {
        taxes += tax;
      
        let record = taxMap.get(taxBrackets[i].rate);

        if (!record) {
          // Create the entry in the map with zero starting values.
          record = { tax: 0, amount: 0 }
          taxMap.set(taxBrackets[i].rate, record)
        }

        // Update the map entry by adding in the new amount and tax
        record.amount += amount
        record.tax += tax
      }
    
      if (income < upperBound) {
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

  static printTaxes(taxMap: TaxMap): TaxResults {
    const sortedEntries = [...taxMap.entries()].sort((a, b) => (a[0] - b[0]))

    let totalTaxes = 0
    let totalTaxedAmount = 0
    let totalIncome = 0
    let marginalTaxRate = 0

    for (const [rate, record] of sortedEntries) {
      totalTaxes += record.tax

      if (record.tax > 0) {
        totalTaxedAmount += record.amount
      }

      totalIncome += record.amount

      if (record.tax > 0) {
        marginalTaxRate = rate
      }
    }

    const effectiveTaxRate = totalIncome == 0 ? 0 : totalTaxes / totalIncome * 100.0;

    return {
      brackets: sortedEntries,
      totalTaxedAmount,
      totalTaxes,
      marginalTaxRate,
      effectiveTaxRate,
    }
  }

  @computed
  get run(): TaxResults {
    const taxBrackets = new Map<number, TaxBracketEntry>()

    const line1 = this.taxableIncome;
    const line2 = this.qualifiedDividends;
    const line3 = (((this.longTermCapitalGains + this.actualLongTermCapitalGains) <= 0 || this.capitalGains <= 0)
        ? 0
        : Math.min((this.longTermCapitalGains + this.actualLongTermCapitalGains), this.capitalGains)
      )

    // line4 - dividends and gains
    const line4 = line2 + line3

    // line 5 - ordinary income
    const line5 = Math.max(line1 - line4, 0);

    // Compute 0% taxes
    const line6 = Taxes.getMaxZeroPctTaxableIncome(this.filingStatus);

    const line7 = Math.min(line1, line6);

    const line8 = Math.min(line5, line7);

    // line 9
    const line9 = Math.max(line7 - line8, 0);

    if (line9 > 0) {
      taxBrackets.set(0, { amount: line9, tax: 0 })
    }

    // Compute 15% taxes
    const line10 = Math.min(line1, line4)

    const line11 = line9

    const line12 = Math.max(line10 - line11, 0)

    const line13 = Taxes.getMaxFifteenPctTaxableIncome(this.filingStatus);

    const line14 = Math.min(line1, line13)

    const line15 = line5 + line9

    const line16 = Math.max(line14 - line15, 0);

    const line17 = Math.min(line12, line16)

    let line18 = 0
    if (Math.round(line17 * 100)> 0) {
      line18 = line17 * 0.15;
      taxBrackets.set(15, { amount: line17, tax: line18 })
    }

    const line19 = line9 + line17

    // Compute 20% taxes
    const line20 = Math.max(line10 - line19, 0);

    let line21 = 0
    if (Math.round(line20 * 100)> 0) {
      line21 = line20 * 0.20;
      taxBrackets.set(20, { amount: line20, tax: line21 })
    }

    // Compute regular tax rate
    const line22 = this.computeTax(line5, taxBrackets)

    const line23 = line18 + line21 + line22;

    // Compute taxes on taxable income amount
    const taxableIncomeTaxBrackets = new Map<number, TaxBracketEntry>();
    const line24 = this.computeTax(line1, taxableIncomeTaxBrackets)

    // const t1 = [...taxBrackets.entries()].reduce((prev, current) => (
    //   current[1].tax + prev
    // ), 0)

    // const t2 = [...taxableIncomeTaxBrackets.entries()].reduce((prev, current) => (
    //   current[1].tax + prev
    // ), 0)

    const line25 = Math.min(line23, line24)
    console.log(line25)

    if (line23 < line24) {
      return Taxes.printTaxes(taxBrackets)
    }

    return Taxes.printTaxes(taxableIncomeTaxBrackets)
  }
}