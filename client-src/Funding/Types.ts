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
