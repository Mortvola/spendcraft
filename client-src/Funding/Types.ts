import type { MoneyCents } from '../../common/moneyCents';
import { CategorySpreadEntry } from '../CategorySpread/CategorySpread';

export interface FundingType {
  id?: number,
  amount: number,
  categoryId: number,
}

export interface FundingInfoType {
  categoryId: number,
  initialAmountCents: MoneyCents,
  previousFundingCents: MoneyCents,
  previousBaseAmountCents: MoneyCents,
  previousExpensesCents: MoneyCents,
  previousCatTransfersCents: MoneyCents,
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

