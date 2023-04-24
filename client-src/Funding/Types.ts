export type FundingType = {
  id?: number,
  amount: number,
  categoryId: number,
}

export type FundingInfoType = {
  categoryId: number,
  initialAmount: number,
  previousFunding: number,
  previousExpenses: number,
  previousCatTransfers: number,
}

export type FundingPlanType = {
  planId: number;
  categories: FundingType[]
}

export type CategoriesValueType = Record<string, number | string>;

export type ValueType = {
  date: string,
  categories: CategoriesValueType,
}

