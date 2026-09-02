import { FilingStatus } from "../../../common/ResponseTypes";

export interface TaxesInterface {
  filingStatus: FilingStatus;

  standardDeduction: number;
}
