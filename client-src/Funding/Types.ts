import type { MoneyCents } from '../../common/moneyCents.js';

export interface FundingInfoType {
  categoryId: number,
  initialAmountCents: MoneyCents,
  previousFundingCents: MoneyCents,
  previousBaseAmountCents: MoneyCents,
  previousExpensesCents: MoneyCents,
  previousCatTransfersCents: MoneyCents,
}

export type CategorySpreadInput = { id?: number; categoryId: number } & (
  { percentage: true; amount: number } | { percentage: false; amount: string }
);

export type CategoriesValueType = Record<
  string,
  {
    baseAmount: string,
    fundingCategories: CategorySpreadInput[],
    includeFundingTransfers: boolean,
  }
>;

export interface ValueType {
  date: string,
  categories: CategoriesValueType,
}

