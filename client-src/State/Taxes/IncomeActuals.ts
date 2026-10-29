import { formatMoneyCents, parseMoneyCents, type MoneyCents } from "../../../common/moneyCents";
import { observable } from "mobx";

class IncomeActuals {
  get estimatedTaxPayments() { return Number(formatMoneyCents(this.estimatedTaxPaymentsCents)); }

  @observable
  accessor taxableInterestCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor oridinaryDividendsCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor taxableSocialSecurityBenefitsCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor estimatedTaxPaymentsCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor shortTermCapitalGainsCents: MoneyCents = parseMoneyCents("0.00");

  @observable
  accessor longTermCapitalGainsCents: MoneyCents = parseMoneyCents("0.00");
}

export default IncomeActuals;
