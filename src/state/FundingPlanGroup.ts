import { makeAutoObservable } from "mobx";
import { StoreInterface } from "./State";
import { FundingPlanGroupProps } from '../../common/ResponseTypes';
import FundingPlanCategory from "./FundingPlanCategory";

class FundingPlanGroup {
  id: number;

  categories: Array<FundingPlanCategory>;

  name: string;

  system: boolean;

  store: StoreInterface;

  constructor(store: StoreInterface, props: FundingPlanGroupProps) {
    this.id = props.id;
    this.categories = props.categories;
    this.name = props.name;
    this.system = props.system;

    makeAutoObservable(this);

    this.store = store;
  }
}

export default FundingPlanGroup;
