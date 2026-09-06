import { observable } from "mobx";

class IncomeActuals {
  @observable
  accessor taxableInterest = 0;

  @observable
  accessor oridinaryDividends = 0;

  @observable
  accessor taxableSocialSecurityBenefits = 0;

  @observable
  accessor estimatedTaxPayments = 0;

  @observable
  accessor shortTermCapitalGains = 0;

  @observable
  accessor longTermCapitalGains = 0;
}

export default IncomeActuals;
