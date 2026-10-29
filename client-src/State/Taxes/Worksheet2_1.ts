import { formatMoneyCents, parseMoneyCents, type MoneyCents } from "../../../common/moneyCents";
import { autorun, observable } from "mobx";
import { Worksheet21Result, worksheet2_1_2026 } from "./Estimated";
import { TaxesInterface } from "./Types";

class Worksheet2_1 {
  get expectedAgi() { return Number(formatMoneyCents(this.expectedAgiCents)); }

  get priorYearAgi() { return Number(formatMoneyCents(this.priorYearAgiCents)); }

  get priorYearTotalTax() { return Number(formatMoneyCents(this.priorYearTotalTaxCents)); }

  @observable
  accessor expectedAgiCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor priorYearAgiCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor priorYearTotalTaxCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor result: Worksheet21Result | null = null;

  taxes: TaxesInterface;

  constructor(taxes: TaxesInterface) {
    this.taxes = taxes;

    this.expectedAgiCents = parseMoneyCents("0.00");
    this.priorYearAgiCents = parseMoneyCents("0.00");
    this.priorYearTotalTaxCents = parseMoneyCents("0.00");

    autorun(() => {
      this.update()
    })
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
