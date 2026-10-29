import { taxResultCents } from './taxResultCents';
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
  brackets: [number, { amountCents: MoneyCents; taxCents: MoneyCents }][],
  totalTaxedAmountCents: MoneyCents,
  totalTaxesCents: MoneyCents,
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

  taxBrackets(): { rate: number, startAmountCents: MoneyCents }[] {
    switch (this.filingStatus) {
      case FilingStatus.Single:
        return [
            { rate : 10, startAmountCents : parseMoneyCents("0.00") },
            { rate : 12, startAmountCents : parseMoneyCents("11925.00") },
            { rate : 22, startAmountCents : parseMoneyCents("48475.00") },
            { rate : 24, startAmountCents : parseMoneyCents("103350.00") },
            { rate : 32, startAmountCents : parseMoneyCents("197300.00") },
            { rate : 35, startAmountCents : parseMoneyCents("250525.00") },
            { rate : 37, startAmountCents : parseMoneyCents("626350.00") }
        ]

      case FilingStatus.MarriedFilingSeparate:
        return [
            { rate : 10, startAmountCents : parseMoneyCents("0.00") },
            { rate : 12, startAmountCents : parseMoneyCents("11925.00") },
            { rate : 22, startAmountCents : parseMoneyCents("48475.00") },
            { rate : 24, startAmountCents : parseMoneyCents("103350.00") },
            { rate : 32, startAmountCents : parseMoneyCents("197300.00") },
            { rate : 35, startAmountCents : parseMoneyCents("250525.00") },
            { rate : 37, startAmountCents : parseMoneyCents("375800.00") }
        ]

      case FilingStatus.QualifyingSurvivingSpouse:
      case FilingStatus.MarriedFilingJointly:
        return [
          { rate : 10, startAmountCents : parseMoneyCents("0.00") },
          { rate : 12, startAmountCents : parseMoneyCents("23850.00") },
          { rate : 22, startAmountCents : parseMoneyCents("96950.00") },
          { rate : 24, startAmountCents : parseMoneyCents("206700.00") },
          { rate : 32, startAmountCents : parseMoneyCents("394600.00") },
          { rate : 35, startAmountCents : parseMoneyCents("501050.00") },
          { rate : 37, startAmountCents : parseMoneyCents("751600.00") }
        ]

      case FilingStatus.HeadOfHousehold:
        return [
            { rate : 10, startAmountCents : parseMoneyCents("0.00") },
            { rate : 12, startAmountCents : parseMoneyCents("17000.00") },
            { rate : 22, startAmountCents : parseMoneyCents("64850.00") },
            { rate : 24, startAmountCents : parseMoneyCents("103350.00") },
            { rate : 32, startAmountCents : parseMoneyCents("197300.00") },
            { rate : 35, startAmountCents : parseMoneyCents("250525.00") },
            { rate : 37, startAmountCents : parseMoneyCents("626350.00") }
        ]
    }
  }

  computeOrdinaryTax(income: MoneyCents, taxMap: TaxMap): number {
    let taxes = 0;
    addMoneyCents(income); // Reject invalid cent inputs before updating the tax map.

    const taxBrackets = this.taxBrackets();

    for (let i = 0; i < taxBrackets.length; i += 1) {
      const upperBound = taxBrackets[i + 1]?.startAmountCents;
      const cappedIncome = upperBound !== undefined && income > upperBound ? upperBound : income;
      const amountCents = subtractMoneyCents(cappedIncome, taxBrackets[i].startAmountCents);
      // The remaining worksheet uses dollar-number tax results. Preserve its
      // fractional-cent tax accumulation; do not round each bracket.
      const amount = Number(formatMoneyCents(amountCents));
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
    
      if (upperBound === undefined || income < upperBound) {
        break;
      }
    }

    return taxes;
  }

  maxZeroPctTaxableIncomeCents(): MoneyCents {
    switch (this.filingStatus) {
      case FilingStatus.Single:
      case FilingStatus.MarriedFilingSeparate:
        return parseMoneyCents("48350.00");
      case FilingStatus.QualifyingSurvivingSpouse:
      case FilingStatus.MarriedFilingJointly:
        return parseMoneyCents("96700.00");
      case FilingStatus.HeadOfHousehold:
        return parseMoneyCents("64750.00");
    }
  }

  maxFifteenPctTaxableIncomeCents(): MoneyCents {
    switch (this.filingStatus) {
      case FilingStatus.Single:
        return parseMoneyCents("533400.00");
      case FilingStatus.MarriedFilingSeparate:
        return parseMoneyCents("300000.00");
      case FilingStatus.QualifyingSurvivingSpouse:
      case FilingStatus.MarriedFilingJointly:
        return parseMoneyCents("600050.00");
      case FilingStatus.HeadOfHousehold:
        return parseMoneyCents("566700.00");
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
      brackets: sortedEntries.map(([rate, entry]) => [rate, {
        amountCents: taxResultCents(entry.amount),
        taxCents: taxResultCents(entry.tax),
      }]),
      totalTaxedAmountCents: taxResultCents(totalTaxedAmount),
      totalTaxesCents: taxResultCents(totalTaxes),
      marginalTaxRate,
      effectiveTaxRate,
    }
  }

  @computed
  get run(): TaxResults {
    const taxBrackets = new Map<number, TaxBracketEntry>()

    const zero = parseMoneyCents("0.00");
    const period = getCurrentPeriod();
    const taxableIncomeCents = this.getTaxableIncomeCents(period);
    const longTermGainsCents = addMoneyCents(this.income.longTermCapitalGainsCents,
      this.income.actuals[period].longTermCapitalGainsCents);
    const capitalGainsCents = this.income.getCapitalGainsCents(period);
    const eligibleGainsCents = longTermGainsCents <= 0 || capitalGainsCents <= 0
      ? zero : longTermGainsCents < capitalGainsCents ? longTermGainsCents : capitalGainsCents;
    const dividendsAndGainsCents = addMoneyCents(this.income.qualifiedDividendsCents, eligibleGainsCents);
    const ordinaryIncomeDifference = subtractMoneyCents(taxableIncomeCents, dividendsAndGainsCents);
    const ordinaryIncomeCents = ordinaryIncomeDifference < 0 ? zero : ordinaryIncomeDifference;

    // Allocate taxable amounts entirely in cents. Only percentage-tax results
    // cross into the existing unrounded dollar-number tax map.
    const line6 = this.maxZeroPctTaxableIncomeCents();
    const line7 = taxableIncomeCents < line6 ? taxableIncomeCents : line6;
    const line8 = ordinaryIncomeCents < line7 ? ordinaryIncomeCents : line7;
    const line9Difference = subtractMoneyCents(line7, line8);
    const line9 = line9Difference > 0 ? line9Difference : zero;

    if (line9 > 0) {
      taxBrackets.set(0, { amount: Number(formatMoneyCents(line9)), tax: 0 });
    }

    // Compute 15% taxes
    const line10 = taxableIncomeCents < dividendsAndGainsCents ? taxableIncomeCents : dividendsAndGainsCents;
    const line12Difference = subtractMoneyCents(line10, line9);
    const line12 = line12Difference > 0 ? line12Difference : zero;
    const line13 = this.maxFifteenPctTaxableIncomeCents();
    const line14 = taxableIncomeCents < line13 ? taxableIncomeCents : line13;
    const line15 = addMoneyCents(ordinaryIncomeCents, line9);
    const line16Difference = subtractMoneyCents(line14, line15);
    const line16 = line16Difference > 0 ? line16Difference : zero;
    const line17 = line12 < line16 ? line12 : line16;

    let line18 = 0;
    if (line17 > 0) {
      const amount = Number(formatMoneyCents(line17));
      line18 = amount * 0.15;
      taxBrackets.set(15, { amount, tax: line18 });
    }

    // Compute 20% taxes
    const line19 = addMoneyCents(line9, line17);
    const line20Difference = subtractMoneyCents(line10, line19);
    const line20 = line20Difference > 0 ? line20Difference : zero;

    let line21 = 0;
    if (line20 > 0) {
      const amount = Number(formatMoneyCents(line20));
      line21 = amount * 0.20;
      taxBrackets.set(20, { amount, tax: line21 });
    }

    // Compute regular tax rate
    const line22 = this.computeOrdinaryTax(ordinaryIncomeCents, taxBrackets)

    const line23 = line18 + line21 + line22;

    // Compute taxes on taxable income amount
    const taxableIncomeTaxBrackets = new Map<number, TaxBracketEntry>();
    const line24 = this.computeOrdinaryTax(taxableIncomeCents, taxableIncomeTaxBrackets)

    // const line25 = Math.min(line23, line24)
    // console.log(line25)

    if (line23 < line24) {
      return Taxes.printTaxes(taxBrackets)
    }

    return Taxes.printTaxes(taxableIncomeTaxBrackets)
  }
}