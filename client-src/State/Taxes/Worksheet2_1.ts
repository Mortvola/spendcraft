import { observable } from "mobx";
import { Worksheet21Result, worksheet2_1_2026 } from "./Estimated";
import { TaxesInterface } from "./Types";

class Worksheet2_1 {
  @observable
  accessor expectedAgi = 0;

  @observable
  accessor priorYearAgi = 0;

  @observable
  accessor priorYearTotalTax = 0;

  @observable
  accessor result: Worksheet21Result | null = null;

  taxes: TaxesInterface;

  constructor(taxes: TaxesInterface) {
    this.taxes = taxes;

    this.expectedAgi = 0;
    this.priorYearAgi = 0;
    this.priorYearTotalTax = 0;

    this.update()
  }

  update(): void {
    this.result = worksheet2_1_2026({
      filingStatus: this.taxes.filingStatus,
      adjustedGrossIncome: this.expectedAgi,
      deductions: this.taxes.standardDeduction,
      priorYearAdjustedGrossIncome: this.priorYearAgi,
      priorYearTotalTax: this.priorYearTotalTax,
    })    
  }
}

export default Worksheet2_1;
