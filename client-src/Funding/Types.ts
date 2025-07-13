import { CategorySpreadEntry } from '../CategorySpread/CategorySpread';

export interface FundingType {
  id?: number,
  amount: number,
  categoryId: number,
}

export interface FundingInfoType {
  categoryId: number,
  initialAmount: number,
  previousFunding: number,
  previousBaseAmount: number,
  previousExpenses: number,
  previousCatTransfers: number,
}

export interface FundingPlanType {
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

export interface ValueType {
  date: string,
  categories: CategoriesValueType,
}

