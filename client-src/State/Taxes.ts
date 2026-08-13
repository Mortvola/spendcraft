import Http from "@mortvola/http";
import { computed, observable, runInAction } from "mobx";
import { ApiResponse, FilingStatus, TaxProps } from "../../common/ResponseTypes";

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
      + this.taxablePensionAndAnnuities + this.taxableSocialSecurityBenefits + this.capitalGains + this.additionalTaxableIncome;
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

    for (let i = 0; i < taxBrackets.length - 1; i += 1) {
      const amount = Math.min(income, taxBrackets[i + 1].startAmount) - taxBrackets[i].startAmount
      const tax = amount * (taxBrackets[i].rate / 100.0)

      if (tax > 0) {
        taxes += tax;
      
        let record = taxMap.get(taxBrackets[i].rate);

        if (!record) {
          record = { tax, amount }
          taxMap.set(taxBrackets[i].rate, record)
        } else {      
          record.amount += amount
          record.tax += tax
        }
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

    const dividendsAndGains = this.qualifiedDividends
      + ((this.longTermCapitalGains <= 0 || this.capitalGains <= 0)
          ? 0
          : Math.min(this.longTermCapitalGains, this.capitalGains)
        )

    // line 5
    const ordinaryIncome = Math.max(this.taxableIncome - dividendsAndGains, 0);

    // Compute 0% taxes
    const maxNonTaxableIncome = Taxes.getMaxZeroPctTaxableIncome(this.filingStatus);

    // line 9
    const zeroPctTaxedAmount = Math.max(Math.min(this.taxableIncome, maxNonTaxableIncome) - ordinaryIncome, 0);

    if (zeroPctTaxedAmount > 0) {
      taxBrackets.set(0, { amount: zeroPctTaxedAmount, tax: 0 })
    }

    // Compute 15% taxes
    const line10 = Math.min(this.taxableIncome, dividendsAndGains)

    const line12 = line10 - zeroPctTaxedAmount

    const line13 = Taxes.getMaxFifteenPctTaxableIncome(this.filingStatus);

    const line14 = Math.min(this.taxableIncome, line13)

    const line15 = ordinaryIncome + zeroPctTaxedAmount

    const line16 = Math.max(line14 - line15, 0);

    const fifteenPctTaxedAmount = Math.min(line12, line16)

    if (Math.round(fifteenPctTaxedAmount * 100) > 0) {
      const fifteenPctTaxes = fifteenPctTaxedAmount * 0.15;
      taxBrackets.set(15, { amount: fifteenPctTaxedAmount, tax: fifteenPctTaxes })
    }

    // Compute 20% taxes
    const twentyPctTaxedAmount = line10 - (zeroPctTaxedAmount + fifteenPctTaxedAmount);

    if (Math.round(twentyPctTaxedAmount * 100) > 0) {
      const twentyPctTaxes = twentyPctTaxedAmount * 0.20;
      taxBrackets.set(20, { amount: twentyPctTaxedAmount, tax: twentyPctTaxes })
    }

    // Compute regular tax rate
    this.computeTax(ordinaryIncome, taxBrackets)

    // Compute taxes on taxable income amount
    const taxableIncomeTaxBrackets = new Map<number, TaxBracketEntry>();
    this.computeTax(this.taxableIncome, taxableIncomeTaxBrackets)

    const t1 = [...taxBrackets.entries()].reduce((prev, current) => (
      current[1].tax + prev
    ), 0)

    const t2 = [...taxableIncomeTaxBrackets.entries()].reduce((prev, current) => (
      current[1].tax + prev
    ), 0)

    if (t1 < t2) {
      return Taxes.printTaxes(taxBrackets)
    }

    return Taxes.printTaxes(taxableIncomeTaxBrackets)
  }
}