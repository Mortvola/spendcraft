import { FilingStatus } from "../../../common/ResponseTypes";
import type Income from "./Income";
import type Worksheet2_1 from "./Worksheet2_1";

export interface TaxesInterface {
  filingStatus: FilingStatus;

  standardDeduction: number;

  income: [Income, Income, Income, Income];

  worksheet2_1: Worksheet2_1
}
