import { calculateFunding, fundingCalculationInputs } from
  '../../../client-src/Funding/calculateFunding.js';
import type { CategorySpreadInput } from '../../../client-src/Funding/Types.js';
import { formatMoneyCents } from '../../../common/moneyCents.js';
// Historical test-only preview from 7ebc714; never used by production.
import type { CategoryFundingProps } from '../../../common/ResponseTypes.js';

export type FundingInputs = Readonly<Record<string, { baseAmount: number | string;
  fundingCategories: CategoryFundingProps['fundingCategories'];
  includeFundingTransfers: boolean }>>;

export const legacyPreview = (categories: FundingInputs, fundingCatId: number) => {
  let sum = 0;

  for (const k of Object.keys(categories)) {
    const categoryId = parseInt(k, 10)

    if (categoryId !== fundingCatId) {
      const cat = categories[k]

      if (cat.fundingCategories.some((fc) => fc.categoryId === fundingCatId)) {
        // At least one funding category matches the one we are looking for
        // Get the total amount by adding the base amount to the amounts for
        // each category that uses this category as a funding source.
        let sum2 = typeof cat.baseAmount === 'string' ? parseFloat(cat.baseAmount) : cat.baseAmount;
        if (cat.includeFundingTransfers) {
          const fundingTransfers = legacyPreview(categories, categoryId)

          sum2 += fundingTransfers
        }

        const funders = legacyComputeSpread(sum2, cat.fundingCategories)
        const funderAmount = funders.get(fundingCatId)

        if (funderAmount !== undefined) {
          sum += funderAmount / 100.0
        }
      }
    }
  }

  return sum;
};

// Previous dollar-based engine retained only as a regression oracle.
// Existing number arithmetic, rounding, comparator and residual recipient are deliberate.
export const legacyComputeSpread = (amount: number, fundingCategories: CategoryFundingProps[
  'fundingCategories']): Map<number, number> => {
  let categoryAmount = Math.round(amount * 100);
  let percentSum = 0;

  // Sort the funding categories by percentage so that fixed amounts are applied before percentage
  // amounts.
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

export const legacyCalculateFunding = (inputs: FundingInputs,
  fundingPoolId: number): CategoryFundingProps[] => {
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
    const categoryFunders = legacyComputeSpread(category.amount, category.fundingCategories);

    for (const [categoryId, amount] of categoryFunders) {
      const funding = funders.get(categoryId) ?? 0;
      funders.set(categoryId, funding + amount)
    }
  }

  // Adjust amounts for categories that have "include funding transfers" set to true.

  for (const category of categories) {
    if (category.includeFundingTransfers) {
      const previousFundingAmount = legacyComputeSpread(category.amount, category
        .fundingCategories);

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

      const newFundingAmount = legacyComputeSpread(category.amount, category.fundingCategories);

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



// Execute the real cent engine, then adapt its results to the server's existing dollar interface.
export function fundingForServer(inputs: FundingInputs,
  fundingPoolId: number): CategoryFundingProps[] {
  const drafts = Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, {
    ...input,
    baseAmount: String(input.baseAmount),
    fundingCategories: input.fundingCategories.map((rule): CategorySpreadInput => rule.percentage
      ? { ...rule, percentage: true }
      : { ...rule, percentage: false, amount: String(rule.amount) }),
  }]));
  return calculateFunding(fundingCalculationInputs(drafts), fundingPoolId).map(({ amountCents,
    baseAmountCents, fundingCategories, ...row }) => ({
    ...row,
    amount: Number(formatMoneyCents(amountCents)),
    baseAmount: Number(formatMoneyCents(baseAmountCents)),
    fundingCategories: fundingCategories.map(rule => {
      if (rule.percentage) return rule;
      const { amountCents, ...metadata } = rule;
      return { ...metadata, amount: Number(formatMoneyCents(amountCents)) };
    }),
  }));
}

export const fundingCategoryEffect = (rows: readonly { categoryId: number; amount: number }[],
  categoryId: number) => (
  rows.filter(row => row.categoryId === categoryId).reduce((sum, row) => sum + row.amount, 0)
);
