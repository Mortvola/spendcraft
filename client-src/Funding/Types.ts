export type FundingType = {
  id?: number,
  initialAmount: number,
  amount: number,
  categoryId: number,
  previousFunding?: number,
  previousExpenses?: number,
}

export type FundingPlanType = {
  planId: number;
  categories: FundingType[]
}
