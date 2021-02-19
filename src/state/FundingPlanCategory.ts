import { makeAutoObservable } from "mobx";
import { FundingPlanCategoryProps } from "./ResponseTypes";
import { StoreInterface } from "./State";

class FundingPlanCategory {
  id: number;

  amount: number;

  constructor(store: StoreInterface, props: FundingPlanCategoryProps) {
    this.id = props.id;
    
    this.amount = props.amount;

    makeAutoObservable(this);
  }
}

export default FundingPlanCategory;