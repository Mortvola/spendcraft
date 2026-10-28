import { addMoneyCents, type MoneyCents } from '../../common/moneyCents.js';
import { inputMoneyCents } from '../monetary.js';
import type { CategoryFundingProps } from '../../common/ResponseTypes.js';

export type FundingInputs = Readonly<Record<string, {
  baseAmount: number | string,
  fundingCategories: CategoryFundingProps['fundingCategories'],
  includeFundingTransfers: boolean,
}>>;

// Existing number arithmetic, rounding, comparator and residual recipient are deliberate.
export const computeSpread = (amount: number, fundingCategories: CategoryFundingProps['fundingCategories']): Map<number, number> => {
  let categoryAmount = Math.round(amount * 100);
  let percentSum = 0;

  // Sort the funding categories by percentage so that fixed amounts are applied before percentage amounts.
  const sortedCategories = (fundingCategories ?? []).slice().sort((a) => (a.percentage ? 1 : -1))

  const funders = new Map<number, number>();

  for (let i = 0; i < sortedCategories.length; i += 1) {
    const fundingCategory = sortedCategories[i];
    const funding = funders.get(fundingCategory.categoryId) ?? 0;
    let fundingAmount: number;

    if (fundingCategory.percentage) {
      fundingAmount = Math.round((fundingCategory.amount / 100.0) * categoryAmount);
      percentSum += fundingAmount;

      // If we are on the last item and there is a remaing amount (due to rounding error)
      // then add it to the last funding amount.
      if (i === sortedCategories.length - 1 && percentSum !== categoryAmount) {
        fundingAmount += categoryAmount - percentSum;
      }
    }
    else {
      fundingAmount = Math.round(fundingCategory.amount * 100);

      // Don't take more than what is left in the category amount
      if (categoryAmount < fundingAmount) {
        fundingAmount = categoryAmount
      }

      categoryAmount -= fundingAmount;
    }

    if (fundingAmount !== 0) {
      funders.set(fundingCategory.categoryId, funding + fundingAmount)
    }
  }

  return funders;
};

export const calculateFunding = (inputs: FundingInputs, fundingPoolId: number): CategoryFundingProps[] => {
  const categories: CategoryFundingProps[] = Object.keys(inputs)
    .filter((k) => parseInt(k, 10) !== fundingPoolId)
    .map((k) => {
      const categoryId = parseInt(k, 10);

      const baseAmount = typeof inputs[k].baseAmount === 'string'
        ? parseFloat(inputs[k].baseAmount)
        : inputs[k].baseAmount;

      const amount = baseAmount

      return {
        categoryId,
        amount,
        fundingCategories: inputs[k].fundingCategories,
        includeFundingTransfers: inputs[k].includeFundingTransfers,
        baseAmount,
      }
    })

  const funders = new Map<number, number>();

  for (const category of categories) {
    const categoryFunders = computeSpread(category.amount, category.fundingCategories);

    for (const [categoryId, amount] of categoryFunders) {
      const funding = funders.get(categoryId) ?? 0;
      funders.set(categoryId, funding + amount)
    }
  }

  // Adjust amounts for categories that have "include funding transfers" set to true.

  for (const category of categories) {
    if (category.includeFundingTransfers) {
      const previousFundingAmount = computeSpread(category.amount, category.fundingCategories);

      for (const [categoryId, amount] of previousFundingAmount) {
        const funding = funders.get(categoryId) ?? 0;
        funders.set(categoryId, funding - amount)
      }

      // Find funder that matches this category and add the amount.
      let sum = 0;

      for (const [categoryId, amount] of funders) {
        if (categoryId === category.categoryId) {
          sum += amount;
        }
      }

      category.amount += sum / 100.0;

      const newFundingAmount = computeSpread(category.amount, category.fundingCategories);

      for (const [categoryId, amount] of newFundingAmount) {
        const funding = funders.get(categoryId) ?? 0;
        funders.set(categoryId, funding + amount)
      }
    }
  }

  for (const [categoryId, amount] of funders) {
    categories.push({
      categoryId,
      amount: -amount / 100.0,
      baseAmount: 0,
      funder: true,
      fundingCategories: [],
      includeFundingTransfers: false,
    });
  }

  return categories;
};

// Sum posted rows in their posting order, including destination and funder rows.
export const fundingCategoryEffect = (rows: readonly Pick<CategoryFundingProps, 'categoryId' | 'amount'>[], categoryId: number): number => (
  rows.filter((row) => row.categoryId === categoryId).reduce((sum, row) => sum + row.amount, 0)
);

// Preview the final posted rows: round each row at the existing persistence boundary,
// then sum cents without changing spread calculations or intermediate precision.
export const fundingCategoryEffectCents = (rows: readonly Pick<CategoryFundingProps, 'categoryId' | 'amount'>[], categoryId: number): MoneyCents => (
  addMoneyCents(...rows.filter(row => row.categoryId === categoryId).map(row => inputMoneyCents(row.amount)))
);
