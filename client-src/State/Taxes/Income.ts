import { observable } from "mobx";
import { FilingStatus } from "../../../common/ResponseTypes";
import { TaxesInterface } from "./Types";
import IncomeActuals from "./IncomeActuals";
import { getCurrentPeriod } from "./Estimated";

class Income {
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

  @observable
  accessor shortTermCapitalGains = 0;

  @observable
  accessor longTermCapitalGains = 0;

  actuals = [new IncomeActuals(), new IncomeActuals(), new IncomeActuals, new IncomeActuals()];

  taxes: TaxesInterface;

  constructor(taxes: TaxesInterface) {
    this.taxes = taxes
  }

  getCapitalGains(period: number) {
    let gains = this.actuals[period].shortTermCapitalGains
      + this.actuals[period].longTermCapitalGains

    if (getCurrentPeriod() === period) {
      gains += this.shortTermCapitalGains + this.longTermCapitalGains
    }

    if (gains < 0) {
      return Math.max(gains, this.taxes.filingStatus === FilingStatus.MarriedFilingSeparate ? -1500 : -3000)
    }

    return gains;
  }

  getTotalIncome(period: number) {
    let totalIncome = this.getCapitalGains(period)
      + this.actuals[period].taxableInterest
      + this.actuals[period].oridinaryDividends
      + this.actuals[period].taxableSocialSecurityBenefits;

    if (getCurrentPeriod() === period) {
      totalIncome += this.taxableInterest + this.ordinaryDividends + this.taxableIraDistributions
        + this.taxablePensionAndAnnuities + this.taxableSocialSecurityBenefits
        + this.additionalTaxableIncome
      }

    return totalIncome
  }

  getAdjustedGrossIncome(period: number) {
    let adjustedGrossIncome = this.getTotalIncome(period);

    if (getCurrentPeriod() === period) {
      adjustedGrossIncome += 0;
    }

    return adjustedGrossIncome;
  }
}

export default Income;
