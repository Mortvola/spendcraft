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

export type CategoriesValueType = Record<
  string,
  {
    amount: number | string,
    fundingCategories: { categoryId: number, amount: number, percentage: boolean }[],
  }
>;

export type ValueType = {
  date: string,
  categories: CategoriesValueType,
}

