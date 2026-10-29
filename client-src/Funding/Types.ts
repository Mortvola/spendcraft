import type { MoneyCents } from '../../common/moneyCents';
import { CategorySpreadInput } from '../CategorySpread/CategorySpread';

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
    baseAmount: string,
    fundingCategories: CategorySpreadInput[],
    includeFundingTransfers: boolean,
  }
>;

export interface ValueType {
  date: string,
  categories: CategoriesValueType,
}

