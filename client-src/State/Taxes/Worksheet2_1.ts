import { observable } from "mobx";
import { Worksheet2_1_Props } from "../../../common/ResponseTypes";

class Worksheet2_1 {
  @observable
  accessor expectedAgi: number;

  @observable
  accessor priorYearAgi: number;

  @observable
  accessor priorYearTotalTax: number;

  constructor(props?: Worksheet2_1_Props) {
    this.expectedAgi = props?.expectedAgi ?? 0;
    this.priorYearAgi = props?.priorYearAgi ?? 0;
    this.priorYearTotalTax = props?.priorYearAgi ?? 0;
  }
}

export default Worksheet2_1;
