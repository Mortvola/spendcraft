import Http from "@mortvola/http";
import { computed, observable, runInAction } from "mobx";
import { ApiResponse, FilingStatus, TaxProps } from "../../../common/ResponseTypes";
import { Worksheet29PeriodResult, worksheet2_10_2026, worksheet2_9_2026, WORKSHEET_2_9_2026 } from "./Estimated";
import Income from "./Income";
import { TaxesInterface } from "./Types";
import Worksheet2_1 from "./Worksheet2_1";

export interface TaxBracketEntry { tax: number, amount: number }

export interface TaxResults {
  brackets: [number, TaxBracketEntry][],
  totalTaxedAmount: number,
  totalTaxes: number,
  marginalTaxRate: number,
  effectiveTaxRate: number,
}

type TaxMap = Map<number, TaxBracketEntry>;

export default class Taxes implements TaxesInterface {
  @observable
  accessor year = 2026;

  currentPeriod: number;

  @observable
  accessor filingStatus = FilingStatus.MarriedFilingJointly;

  income: [Income, Income, Income, Income];

  @observable
  accessor qualifiedBusinessIncomeDeduction = 0;

  @computed
  get standardDeduction() {
    switch (this.filingStatus) {
      case FilingStatus.Single:
        return 15750;
      case FilingStatus.MarriedFilingSeparate:
        return 15000;
      case FilingStatus.QualifyingSurvivingSpouse:
      case FilingStatus.MarriedFilingJointly:
        return 31500;
      case FilingStatus.HeadOfHousehold:
        return 23625;
    }
  }

  @computed
  get taxableIncome() {
    return Math.max(this.income[this.currentPeriod].adjustedGrossIncome
      - (this.standardDeduction + this.qualifiedBusinessIncomeDeduction), 0);
  }

  worksheet2_1: Worksheet2_1;

  constructor() {
    this.income = [
      new Income(this),
      new Income(this),
      new Income(this),
      new Income(this),
    ];

    this.currentPeriod = 2;

    this.worksheet2_1 = new Worksheet2_1(this)
  }

  async load() {
    const response = await Http.get<ApiResponse<TaxProps>>(`/api/v1/taxes/${this.year}`);

    if (response.ok) {
      const { data } = await response.body();

      if (data) {
        runInAction(() => {
          this.filingStatus = data.forecast?.filingStatus ?? FilingStatus.Single;
          this.income[this.currentPeriod].taxableInterest = data.forecast?.taxableInterest ?? 0;
          this.income[this.currentPeriod].qualifiedDividends = data.forecast?.qualifiedDividends ?? 0;
          this.income[this.currentPeriod].ordinaryDividends = data.forecast?.ordinaryDividends ?? 0;
          this.income[this.currentPeriod].taxableIraDistributions = data.forecast?.taxableIraDistributions ?? 0;
          this.income[this.currentPeriod].taxablePensionAndAnnuities = data.forecast?.taxablePensionAndAnnuities ?? 0;
          this.income[this.currentPeriod].taxableSocialSecurityBenefits = data.forecast?.taxableSocialSecurityBenefits ?? 0;
          this.income[this.currentPeriod].additionalTaxableIncome = data.forecast?.additionalTaxableIncome ?? 0;
          this.income[this.currentPeriod].shortTermCapitalGains = data.forecast?.shortTermCapitalGains ?? 0;
          this.income[this.currentPeriod].longTermCapitalGains = data.forecast?.longTermCapitalGains ?? 0;
          this.qualifiedBusinessIncomeDeduction = data.forecast?.qualifiedBusinessIncomeDeduction ?? 0;

          for (let i = 0; i < 4; i += 1) {
            this.income[i].actualTaxableInterest = 0;
            this.income[i].actualOridinaryDividends = 0;
            this.income[i].actualShortTermCapitalGains = 0;
            this.income[i].actualLongTermCapitalGains = 0;
            this.income[i].actualTaxableSocialSecurityBenefits = 0;
            this.income[i].actualEstimatedTaxPayments = 0;
          }
        
          if (data.actuals) {
            const periodMonthEnd = [3, 5, 8, 12];

            for (const actuals of data.actuals) {
              for (let period = 0; period < 4; period += 1) {
                if (actuals.month <= periodMonthEnd[period]) {
                  this.income[period].actualTaxableInterest += actuals.taxableInterest ?? 0;
                  this.income[period].actualOridinaryDividends += actuals.ordinaryDividends ?? 0;
                  this.income[period].actualShortTermCapitalGains += actuals.shortTermCapitalGains ?? 0;
                  this.income[period].actualLongTermCapitalGains += actuals.longTermCapitalGains ?? 0;
                  this.income[period].actualTaxableSocialSecurityBenefits += actuals.taxes.taxable_social_security_benefits ?? 0;
                  this.income[period].actualEstimatedTaxPayments += actuals.taxes.estimated_tax_payments ?? 0;
                }
              }
            }
          }

          if (data.forecast?.estimated) {
            this.worksheet2_1.expectedAgi = data.forecast.estimated.expectedAgi
            this.worksheet2_1.priorYearAgi = data.forecast.estimated.priorYearAgi
            this.worksheet2_1.priorYearTotalTax = data.forecast.estimated.priorYearTotalTax

            this.worksheet2_1.update()
          }
        })
      }
    }
  }

  async save() {
    const response = await Http.post<TaxProps, ApiResponse<TaxProps>>('/api/v1/taxes', {
      year: this.year,
      forecast: {
        filingStatus: this.filingStatus,
        taxableInterest: this.income[this.currentPeriod].taxableInterest,
        qualifiedDividends: this.income[this.currentPeriod].qualifiedDividends,
        ordinaryDividends: this.income[this.currentPeriod].ordinaryDividends,
        taxableIraDistributions: this.income[this.currentPeriod].taxableIraDistributions,
        taxablePensionAndAnnuities: this.income[this.currentPeriod].taxablePensionAndAnnuities,
        taxableSocialSecurityBenefits: this.income[this.currentPeriod].taxableSocialSecurityBenefits,
        additionalTaxableIncome: this.income[this.currentPeriod].additionalTaxableIncome,
        shortTermCapitalGains: this.income[this.currentPeriod].shortTermCapitalGains,
        longTermCapitalGains: this.income[this.currentPeriod].longTermCapitalGains,
        qualifiedBusinessIncomeDeduction: this.qualifiedBusinessIncomeDeduction,
        estimated: {
          expectedAgi: this.worksheet2_1.expectedAgi,
          priorYearAgi: this.worksheet2_1.priorYearAgi,
          priorYearTotalTax: this.worksheet2_1.priorYearTotalTax,
        } 
      },
    })

    if (response.ok) {
      const { data } = await response.body();

      if (data) {
        runInAction(() => {
          this.filingStatus = data.forecast?.filingStatus ?? FilingStatus.Single;
          this.income[this.currentPeriod].taxableInterest = data.forecast?.taxableInterest ?? 0;
          this.income[this.currentPeriod].qualifiedDividends = data.forecast?.qualifiedDividends ?? 0;
          this.income[this.currentPeriod].ordinaryDividends = data.forecast?.ordinaryDividends ?? 0;
          this.income[this.currentPeriod].taxableIraDistributions = data.forecast?.taxableIraDistributions ?? 0;
          this.income[this.currentPeriod].taxablePensionAndAnnuities = data.forecast?.taxablePensionAndAnnuities ?? 0;
          this.income[this.currentPeriod].taxableSocialSecurityBenefits = data.forecast?.taxableSocialSecurityBenefits ?? 0;
          this.income[this.currentPeriod].additionalTaxableIncome = data.forecast?.additionalTaxableIncome ?? 0;
          this.income[this.currentPeriod].shortTermCapitalGains = data.forecast?.shortTermCapitalGains ?? 0;
          this.income[this.currentPeriod].longTermCapitalGains = data.forecast?.longTermCapitalGains ?? 0;
          this.qualifiedBusinessIncomeDeduction = data.forecast?.qualifiedBusinessIncomeDeduction ?? 0;

          for (let i = 0; i <= 3; i += 1) {
            this.income[i].actualTaxableInterest = 0;
            this.income[i].actualOridinaryDividends = 0;
            this.income[i].actualShortTermCapitalGains = 0;
            this.income[i].actualLongTermCapitalGains = 0;
            this.income[i].actualTaxableSocialSecurityBenefits = 0;
          }

          if (data.actuals) {
            const periodMonthEnd = [3, 5, 8, 12];

            for (let period = 0; period < 4; period += 1) {
              for (const actuals of data.actuals) {
                if (actuals.month <= periodMonthEnd[period]) {
                  this.income[period].actualTaxableInterest += actuals.taxableInterest ?? 0;
                  this.income[period].actualOridinaryDividends += actuals.ordinaryDividends ?? 0;
                  this.income[period].actualShortTermCapitalGains += actuals.shortTermCapitalGains ?? 0;
                  this.income[period].actualLongTermCapitalGains += actuals.longTermCapitalGains ?? 0;
                  this.income[period].actualTaxableSocialSecurityBenefits += actuals.taxes.taxable_social_security_benefits ?? 0;
                  this.income[period].actualEstimatedTaxPayments += actuals.taxes.estimated_tax_payments ?? 0;
                }
              }
            }
          }

          if (data.forecast?.estimated) {
            this.worksheet2_1.expectedAgi = data.forecast.estimated.expectedAgi
            this.worksheet2_1.priorYearAgi = data.forecast.estimated.priorYearAgi
            this.worksheet2_1.priorYearTotalTax = data.forecast.estimated.priorYearTotalTax

            this.worksheet2_1.update()
          }
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

      case FilingStatus.QualifyingSurvivingSpouse:
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

  computeOrdinaryTax(income: number, taxMap: TaxMap): number {
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

  static getMaxZeroPctTaxableIncome(filingStatus: FilingStatus): number {
    switch (filingStatus) {
      case FilingStatus.Single:
      case FilingStatus.MarriedFilingSeparate:
        return 48350;
      case FilingStatus.QualifyingSurvivingSpouse:
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
      case FilingStatus.QualifyingSurvivingSpouse:
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
  get worksheet2_9(): Worksheet29PeriodResult[] {
    const standardDeduction = this.standardDeduction

    return worksheet2_9_2026({
      periods: [{
        agi: this.income[0].adjustedGrossIncome,
        standardDeductionPlusCharity: standardDeduction,
        paymentsAndWithholding: this.income[0].actualEstimatedTaxPayments,
      },
      {
        agi: this.income[1].adjustedGrossIncome,
        standardDeductionPlusCharity: standardDeduction,
        paymentsAndWithholding: this.income[1].actualEstimatedTaxPayments,
      },
      {
        agi: this.income[2].adjustedGrossIncome,
        standardDeductionPlusCharity: standardDeduction,
        paymentsAndWithholding: this.income[2].actualEstimatedTaxPayments,
      },
      {
        agi: this.income[3].adjustedGrossIncome,
        standardDeductionPlusCharity: standardDeduction,
        paymentsAndWithholding: this.income[3].actualEstimatedTaxPayments,
      }],
      taxCalculationCallback: (taxableIncome: number, period: number) => (
        worksheet2_10_2026({
          filingStatus: this.filingStatus,
          line1: taxableIncome,
          line2: this.income[period].qualifiedDividends * WORKSHEET_2_9_2026.annualizationFactors[period],
          line3: this.income[period].capitalGains * WORKSHEET_2_9_2026.annualizationFactors[period],
        })
      ),
      estimatedTaxWorksheetLine12c: this.worksheet2_1.result?.lines['12c'] ?? 0,
    })
  }

  @computed
  get run(): TaxResults {
    const taxBrackets = new Map<number, TaxBracketEntry>()

    const line1 = this.taxableIncome;
    const line2 = this.income[this.currentPeriod].qualifiedDividends;
    const line3 = (((this.income[this.currentPeriod].longTermCapitalGains + this.income[this.currentPeriod].actualLongTermCapitalGains) <= 0 || this.income[this.currentPeriod].capitalGains <= 0)
        ? 0
        : Math.min((this.income[this.currentPeriod].longTermCapitalGains + this.income[this.currentPeriod].actualLongTermCapitalGains), this.income[this.currentPeriod].capitalGains)
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
    const line22 = this.computeOrdinaryTax(line5, taxBrackets)

    const line23 = line18 + line21 + line22;

    // Compute taxes on taxable income amount
    const taxableIncomeTaxBrackets = new Map<number, TaxBracketEntry>();
    const line24 = this.computeOrdinaryTax(line1, taxableIncomeTaxBrackets)

    // const line25 = Math.min(line23, line24)
    // console.log(line25)

    if (line23 < line24) {
      return Taxes.printTaxes(taxBrackets)
    }

    return Taxes.printTaxes(taxableIncomeTaxBrackets)
  }
}