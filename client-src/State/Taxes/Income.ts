import { addMoneyCents, formatMoneyCents, parseMoneyCents, type MoneyCents } from "../../../common/moneyCents";
import { observable } from "mobx";
import { FilingStatus } from "../../../common/ResponseTypes";
import { TaxesInterface } from "./Types";
import IncomeActuals from "./IncomeActuals";
import { getCurrentPeriod } from "./Estimated";

class Income {
  get qualifiedDividends() { return Number(formatMoneyCents(this.qualifiedDividendsCents)); }

  @observable
  accessor taxableInterestCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor taxablePensionAndAnnuitiesCents: MoneyCents = parseMoneyCents("0.00");
  
  @observable
  accessor taxableSocialSecurityBenefitsCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor additionalTaxableIncomeCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor taxableIraDistributionsCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor qualifiedDividendsCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor ordinaryDividendsCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor shortTermCapitalGainsCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor longTermCapitalGainsCents: MoneyCents = parseMoneyCents("0.00");

  actuals = [new IncomeActuals(), new IncomeActuals(), new IncomeActuals, new IncomeActuals()];

  taxes: TaxesInterface;

  constructor(taxes: TaxesInterface) {
    this.taxes = taxes
  }

  getCapitalGainsCents(period: number): MoneyCents {
    let gains = addMoneyCents(this.actuals[period].shortTermCapitalGainsCents,
      this.actuals[period].longTermCapitalGainsCents);
    if (getCurrentPeriod() === period) {
      gains = addMoneyCents(gains, this.shortTermCapitalGainsCents, this.longTermCapitalGainsCents);
    }
    const limit = parseMoneyCents(this.taxes.filingStatus === FilingStatus.MarriedFilingSeparate ? "-1500.00" : "-3000.00");
    return gains < limit ? limit : gains;
  }

  getTotalIncomeCents(period: number): MoneyCents {
    const actual = this.actuals[period];
    const total = addMoneyCents(this.getCapitalGainsCents(period), actual.taxableInterestCents,
      actual.oridinaryDividendsCents, actual.taxableSocialSecurityBenefitsCents);
    return getCurrentPeriod() === period
      ? addMoneyCents(total, this.taxableInterestCents, this.ordinaryDividendsCents,
        this.taxableIraDistributionsCents, this.taxablePensionAndAnnuitiesCents,
        this.taxableSocialSecurityBenefitsCents, this.additionalTaxableIncomeCents)
      : total;
  }

  getAdjustedGrossIncomeCents(period: number): MoneyCents {
    return this.getTotalIncomeCents(period);
  }

  // Dollar adapters keep the existing tax worksheets and their intermediate precision unchanged.
  getCapitalGains(period: number) { return Number(formatMoneyCents(this.getCapitalGainsCents(period))); }

  getAdjustedGrossIncome(period: number) { return Number(formatMoneyCents(this.getAdjustedGrossIncomeCents(period))); }
}

export default Income;
