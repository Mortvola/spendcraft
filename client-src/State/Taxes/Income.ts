import { computed, observable } from "mobx";
import { FilingStatus } from "../../../common/ResponseTypes";
import { TaxesInterface } from "./Types";

class Income {
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

  @observable
  accessor actualTaxableSocialSecurityBenefits = 0;

  @observable
  accessor actualEstimatedTaxPayments = 0;

  @computed
  get capitalGains() {
    const gains = this.shortTermCapitalGains + this.longTermCapitalGains
      + this.actualShortTermCapitalGains + this.actualLongTermCapitalGains

    if (gains < 0) {
      return Math.max(gains, this.taxes.filingStatus === FilingStatus.MarriedFilingSeparate ? -1500 : -3000)
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

  @computed
  get totalIncome() {
    return this.taxableInterest + this.ordinaryDividends + this.taxableIraDistributions
      + this.taxablePensionAndAnnuities + this.taxableSocialSecurityBenefits + this.capitalGains + this.additionalTaxableIncome
      + this.actualTaxableInterest + this.actualOridinaryDividends
      + this.actualTaxableSocialSecurityBenefits;
  }

  @computed
  get adjustedGrossIncome() {
    const adjustmentsToIncome = 0;

    return this.totalIncome - adjustmentsToIncome;
  }

  taxes: TaxesInterface;

  constructor(taxes: TaxesInterface) {
    this.taxes = taxes
  }
}

export default Income;
