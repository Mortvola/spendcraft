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
  accessor longTermCapitalGains = 0;

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
    const response = await Http.get<ApiResponse<TaxProps>>('/api/v1/taxes');

    if (response.ok) {
      const { data } = await response.body();

      if (data) {
        runInAction(() => {
          this.filingStatus = data.data.filingStatus ?? 0;
          this.taxableInterest = data.data.taxableInterest ?? 0;
          this.qualifiedDividends = data.data.qualifiedDividends ?? 0;
          this.ordinaryDividends = data.data.ordinaryDividends ?? 0;
          this.taxableIraDistributions = data.data.taxableIraDistributions ?? 0;
          this.taxablePensionAndAnnuities = data.data.taxablePensionAndAnnuities ?? 0;
          this.taxableSocialSecurityBenefits = data.data.taxableSocialSecurityBenefits ?? 0;
          this.additionalTaxableIncome = data.data.additionalTaxableIncome ?? 0;
          this.shortTermCapitalGains = data.data.shortTermCapitalGains ?? 0;
          this.longTermCapitalGains = data.data.longTermCapitalGains ?? 0;
          this.qualifiedBusinessIncomeDeduction = data.data.qualifiedBusinessIncomeDeduction ?? 0;
        })
      }
    }
  }

  async save() {
    Http.post<TaxProps, TaxProps>('/api/v1/taxes', {
      year: 2026,
      data: {
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

  static computeTax(income: number, filingStatus: FilingStatus, taxMap: TaxMap): number {
    let taxes = 0;

    const taxBrackets = Taxes.getTaxBrackets(filingStatus);

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
      console.log(`rate: ${rate}%, amount: ${record.amount}, tax: ${record.tax}`)
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

    // console.log(`total amount: ${totalTaxedAmount}, total taxes: ${totalTaxes}, marginal tax rate: ${marginalTaxRate}, effective tax rate: ${effectiveTaxRate}`)

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

    const line7 = Math.min(this.taxableIncome, maxNonTaxableIncome);

    // line 9
    const zeroPctTaxedAmount = Math.max(line7 - ordinaryIncome, 0);

    if (zeroPctTaxedAmount > 0) {
      taxBrackets.set(0, { amount: zeroPctTaxedAmount, tax: 0 })
    }

    // Compute 15% taxes
    const line10 = Math.min(this.taxableIncome, dividendsAndGains)

    const line12 = line10 - zeroPctTaxedAmount

    const line13 = Taxes.getMaxFifteenPctTaxableIncome(this.filingStatus);

    const line14 = Math.min(this.taxableIncome, line13)

    const line15 = ordinaryIncome + zeroPctTaxedAmount

    const line16 = line14 - line15;

    const fifteenPctTaxedAmount = Math.min(line12, line16)

    if (fifteenPctTaxedAmount) {
      const fifteenPctTaxes = fifteenPctTaxedAmount * 0.15;
      taxBrackets.set(15, { amount: fifteenPctTaxedAmount, tax: fifteenPctTaxes })
    }

    // Compute 20% taxes
    const twentyPctTaxedAmount = line10 - (zeroPctTaxedAmount + fifteenPctTaxedAmount);

    if (twentyPctTaxedAmount > 0) {
      const twentyPctTaxes = twentyPctTaxedAmount * 0.20;
      taxBrackets.set(20, { amount: twentyPctTaxedAmount, tax: twentyPctTaxes })
    }

    // Compute regular tax rate
    Taxes.computeTax(ordinaryIncome, this.filingStatus, taxBrackets)
    return Taxes.printTaxes(taxBrackets)

    // Compute taxes on taxable income amount
    // const taxableIncomeTaxMap = new Map<number, TaxBracketEntry>();

    // Taxes.computeTax(taxableIncome, this.filingStatus, taxableIncomeTaxMap)
    // Taxes.printTaxes(taxableIncomeTaxMap)
  }
}