import { addMoneyCents, subtractMoneyCents, formatMoneyCents, parseMoneyCents, type MoneyCents } from "../../../common/moneyCents";
import Http from "@mortvola/http";
import { computed, observable, runInAction } from "mobx";
import { ApiResponse, FilingStatus, TaxProps, TaxUpdateProps } from "../../../common/ResponseTypes";
import Income from "./Income";
import { TaxesInterface } from "./Types";
import Worksheet2_1 from "./Worksheet2_1";
import Worksheet2_9 from "./Worksheet2_9";
import { getCurrentPeriod } from "./Estimated";

interface TaxBracketEntry { tax: number, amount: number }

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

  @observable
  accessor filingStatus = FilingStatus.MarriedFilingJointly;

  income: Income;

  @observable
  accessor qualifiedBusinessIncomeDeductionCents: MoneyCents = parseMoneyCents("0.00");

  worksheet2_1: Worksheet2_1;

  worksheet2_9: Worksheet2_9;

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

  get standardDeductionCents(): MoneyCents {
    return parseMoneyCents(this.standardDeduction.toFixed(2));
  }

  getTaxableIncomeCents(period: number): MoneyCents {
    const amount = subtractMoneyCents(this.income.getAdjustedGrossIncomeCents(period),
      addMoneyCents(this.standardDeductionCents, this.qualifiedBusinessIncomeDeductionCents));
    return amount < 0 ? parseMoneyCents("0.00") : amount;
  }

  getTaxableIncome(period: number) {
    return Number(formatMoneyCents(this.getTaxableIncomeCents(period)));
  }

  constructor() {
    this.income = new Income(this);

    this.worksheet2_1 = new Worksheet2_1(this);

    this.worksheet2_9 = new Worksheet2_9(this);
  }

  updateValues(data: TaxProps) {
    const amount = (value: string | null | undefined) => value == null ? parseMoneyCents("0.00") : parseMoneyCents(value);
    const forecast = data.forecast && {
      ...data.forecast,
      taxableInterest: amount(data.forecast.taxableInterest),
      qualifiedDividends: amount(data.forecast.qualifiedDividends),
      ordinaryDividends: amount(data.forecast.ordinaryDividends),
      taxableIraDistributions: amount(data.forecast.taxableIraDistributions),
      taxablePensionAndAnnuities: amount(data.forecast.taxablePensionAndAnnuities),
      taxableSocialSecurityBenefits: amount(data.forecast.taxableSocialSecurityBenefits),
      additionalTaxableIncome: amount(data.forecast.additionalTaxableIncome),
      shortTermCapitalGains: amount(data.forecast.shortTermCapitalGains),
      longTermCapitalGains: amount(data.forecast.longTermCapitalGains),
      qualifiedBusinessIncomeDeduction: amount(data.forecast.qualifiedBusinessIncomeDeduction),
      estimated: data.forecast.estimated && {
        expectedAgi: amount(data.forecast.estimated.expectedAgi),
        priorYearAgi: amount(data.forecast.estimated.priorYearAgi),
        priorYearTotalTax: amount(data.forecast.estimated.priorYearTotalTax),
      },
    };
    const decodedActuals = data.actuals?.map((actual) => actual == null ? actual : {
      ...actual,
      taxableInterest: amount(actual.taxableInterest),
      ordinaryDividends: amount(actual.ordinaryDividends),
      shortTermCapitalGains: amount(actual.shortTermCapitalGains),
      longTermCapitalGains: amount(actual.longTermCapitalGains),
      taxes: {
        ...actual.taxes,
        taxable_social_security_benefits: amount(actual.taxes.taxable_social_security_benefits),
        estimated_tax_payments: amount(actual.taxes.estimated_tax_payments),
      },
    });
    const periodActuals = Array.from({ length: 4 }, () => ({
      taxableInterestCents: parseMoneyCents("0.00"),
      oridinaryDividendsCents: parseMoneyCents("0.00"),
      shortTermCapitalGainsCents: parseMoneyCents("0.00"),
      longTermCapitalGainsCents: parseMoneyCents("0.00"),
      taxableSocialSecurityBenefitsCents: parseMoneyCents("0.00"),
      estimatedTaxPaymentsCents: parseMoneyCents("0.00"),
    }));

    if (decodedActuals) {
      const periodMonthEnd = [3, 5, 8, 12];

      for (const actuals of decodedActuals) {
        if (actuals == null) continue;
        for (let period = 0; period < 4; period += 1) {
          if (actuals.month <= periodMonthEnd[period]) {
            periodActuals[period].taxableInterestCents = addMoneyCents(periodActuals[period].taxableInterestCents, actuals.taxableInterest ?? parseMoneyCents("0.00"));
            periodActuals[period].oridinaryDividendsCents = addMoneyCents(periodActuals[period].oridinaryDividendsCents, actuals.ordinaryDividends ?? parseMoneyCents("0.00"));
            periodActuals[period].shortTermCapitalGainsCents = addMoneyCents(periodActuals[period].shortTermCapitalGainsCents, actuals.shortTermCapitalGains ?? parseMoneyCents("0.00"));
            periodActuals[period].longTermCapitalGainsCents = addMoneyCents(periodActuals[period].longTermCapitalGainsCents, actuals.longTermCapitalGains ?? parseMoneyCents("0.00"));
            periodActuals[period].taxableSocialSecurityBenefitsCents = addMoneyCents(periodActuals[period].taxableSocialSecurityBenefitsCents, actuals.taxes.taxable_social_security_benefits ?? parseMoneyCents("0.00"));
            periodActuals[period].estimatedTaxPaymentsCents = addMoneyCents(periodActuals[period].estimatedTaxPaymentsCents, actuals.taxes.estimated_tax_payments ?? parseMoneyCents("0.00"));
          }
        }
      }
    }
    runInAction(() => {
      this.filingStatus = forecast?.filingStatus ?? FilingStatus.Single;
      this.income.taxableInterestCents = forecast?.taxableInterest ?? parseMoneyCents("0.00");
      this.income.qualifiedDividendsCents = forecast?.qualifiedDividends ?? parseMoneyCents("0.00");
      this.income.ordinaryDividendsCents = forecast?.ordinaryDividends ?? parseMoneyCents("0.00");
      this.income.taxableIraDistributionsCents = forecast?.taxableIraDistributions ?? parseMoneyCents("0.00");
      this.income.taxablePensionAndAnnuitiesCents = forecast?.taxablePensionAndAnnuities ?? parseMoneyCents("0.00");
      this.income.taxableSocialSecurityBenefitsCents = forecast?.taxableSocialSecurityBenefits ?? parseMoneyCents("0.00");
      this.income.additionalTaxableIncomeCents = forecast?.additionalTaxableIncome ?? parseMoneyCents("0.00");
      this.income.shortTermCapitalGainsCents = forecast?.shortTermCapitalGains ?? parseMoneyCents("0.00");
      this.income.longTermCapitalGainsCents = forecast?.longTermCapitalGains ?? parseMoneyCents("0.00");
      this.qualifiedBusinessIncomeDeductionCents = forecast?.qualifiedBusinessIncomeDeduction ?? parseMoneyCents("0.00");

      for (let i = 0; i < 4; i += 1) {
        Object.assign(this.income.actuals[i], periodActuals[i]);
      }

      if (forecast?.estimated) {
        this.worksheet2_1.expectedAgiCents = forecast.estimated.expectedAgi
        this.worksheet2_1.priorYearAgiCents = forecast.estimated.priorYearAgi
        this.worksheet2_1.priorYearTotalTaxCents = forecast.estimated.priorYearTotalTax
      }
    })
  }

  async load() {
    const response = await Http.get<ApiResponse<TaxProps>>(`/api/v1/taxes/${this.year}`);

    if (response.ok) {
      const { data } = await response.body();

      if (data) {
        this.updateValues(data)
      }
    }
  }

  async save() {
    const response = await Http.post<TaxUpdateProps, ApiResponse<TaxProps>>('/api/v1/taxes', {
      year: this.year,
      forecast: {
        filingStatus: this.filingStatus,
        taxableInterest: formatMoneyCents(this.income.taxableInterestCents),
        qualifiedDividends: formatMoneyCents(this.income.qualifiedDividendsCents),
        ordinaryDividends: formatMoneyCents(this.income.ordinaryDividendsCents),
        taxableIraDistributions: formatMoneyCents(this.income.taxableIraDistributionsCents),
        taxablePensionAndAnnuities: formatMoneyCents(this.income.taxablePensionAndAnnuitiesCents),
        taxableSocialSecurityBenefits: formatMoneyCents(this.income.taxableSocialSecurityBenefitsCents),
        additionalTaxableIncome: formatMoneyCents(this.income.additionalTaxableIncomeCents),
        shortTermCapitalGains: formatMoneyCents(this.income.shortTermCapitalGainsCents),
        longTermCapitalGains: formatMoneyCents(this.income.longTermCapitalGainsCents),
        qualifiedBusinessIncomeDeduction: formatMoneyCents(this.qualifiedBusinessIncomeDeductionCents),
        estimated: {
          expectedAgi: formatMoneyCents(this.worksheet2_1.expectedAgiCents),
          priorYearAgi: formatMoneyCents(this.worksheet2_1.priorYearAgiCents),
          priorYearTotalTax: formatMoneyCents(this.worksheet2_1.priorYearTotalTaxCents),
        } 
      },
    })

    if (response.ok) {
      const { data } = await response.body();

      if (data) {
        this.updateValues(data)
      }
    }
  }

  taxBrackets(): { rate: number, startAmount: number }[] {
    switch (this.filingStatus) {
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

    const taxBrackets = this.taxBrackets();

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

  maxZeroPctTaxableIncome(): number {
    switch (this.filingStatus) {
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

  maxFifteenPctTaxableIncome(): number {
    switch (this.filingStatus) {
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
  get run(): TaxResults {
    const taxBrackets = new Map<number, TaxBracketEntry>()

    const line1 = this.getTaxableIncome(getCurrentPeriod());
    const line2 = this.income.qualifiedDividends;
    const line3 = (((this.income.longTermCapitalGains + this.income.actuals[getCurrentPeriod()].longTermCapitalGains) <= 0 || this.income.getCapitalGains(getCurrentPeriod()) <= 0)
        ? 0
        : Math.min((this.income.longTermCapitalGains + this.income.actuals[getCurrentPeriod()].longTermCapitalGains), this.income.getCapitalGains(getCurrentPeriod())
      )
    )

    // line4 - dividends and gains
    const line4 = line2 + line3

    // line 5 - ordinary income
    const line5 = Math.max(line1 - line4, 0);

    // Compute 0% taxes
    const line6 = this.maxZeroPctTaxableIncome();

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

    const line13 = this.maxFifteenPctTaxableIncome();

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