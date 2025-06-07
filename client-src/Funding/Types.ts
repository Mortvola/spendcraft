import { CategorySpreadEntry } from '../CategorySpread/CategorySpread';

export type FundingType = {
  id?: number,
  amount: number,
  categoryId: number,
}

export type FundingInfoType = {
  categoryId: number,
  initialAmount: number,
  previousFunding: number,
  previousBaseAmount: number,
  previousExpenses: number,
  previousCatTransfers: number,
}

export type FundingPlanType = {
  planId: number;
  categories: FundingType[]
}

export type CategoriesValueType = Record<
  string,
  {
    baseAmount: number,
    fundingCategories: CategorySpreadEntry[],
    includeFundingTransfers: boolean,
  }
>;

export type ValueType = {
  date: string,
  categories: CategoriesValueType,
}

