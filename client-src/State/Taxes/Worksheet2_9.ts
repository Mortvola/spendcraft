import { autorun, observable } from "mobx";
import { Worksheet29PeriodResult, worksheet2_10_2026, worksheet2_9_2026, WORKSHEET_2_9_2026 } from "./Estimated";
import { TaxesInterface } from "./Types";

class Worksheet2_9 {
  @observable
  accessor result: Worksheet29PeriodResult[] | null = null;

  taxes: TaxesInterface;

  constructor(taxes: TaxesInterface) {
    this.taxes = taxes

    autorun(() => {
      this.update()
    })
  }

  update() {
    const standardDeduction = this.taxes.standardDeduction

    this.result = worksheet2_9_2026({
      periods: [{
        agi: this.taxes.income.getAdjustedGrossIncome(0),
        standardDeductionPlusCharity: standardDeduction,
        paymentsAndWithholding: this.taxes.income.actuals[0].estimatedTaxPayments,
      },
      {
        agi: this.taxes.income.getAdjustedGrossIncome(1),
        standardDeductionPlusCharity: standardDeduction,
        paymentsAndWithholding: this.taxes.income.actuals[1].estimatedTaxPayments,
      },
      {
        agi: this.taxes.income.getAdjustedGrossIncome(2),
        standardDeductionPlusCharity: standardDeduction,
        paymentsAndWithholding: this.taxes.income.actuals[2].estimatedTaxPayments,
      },
      {
        agi: this.taxes.income.getAdjustedGrossIncome(3),
        standardDeductionPlusCharity: standardDeduction,
        paymentsAndWithholding: this.taxes.income.actuals[3].estimatedTaxPayments,
      }],
      taxCalculationCallback: (taxableIncome: number, period: number) => (
        worksheet2_10_2026({
          filingStatus: this.taxes.filingStatus,
          line1: taxableIncome,
          line2: this.taxes.income.qualifiedDividends * WORKSHEET_2_9_2026.annualizationFactors[period],
          line3: this.taxes.income.getCapitalGains(period) * WORKSHEET_2_9_2026.annualizationFactors[period],
        })
      ),
      estimatedTaxWorksheetLine12c: this.taxes.worksheet2_1.result?.lines['12c'] ?? 0,
    })
  }
}

export default Worksheet2_9;
