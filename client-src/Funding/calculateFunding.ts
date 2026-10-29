import { addMoneyCents, subtractMoneyCents, parseMoneyCents, moneyCentsFromInteger, type MoneyCents } from '../../common/moneyCents.js';
import { inputMoneyCents } from '../monetary.js';
import type { CategorySpreadInput } from '../CategorySpread/CategorySpread';
import type { CentFundingRule } from '../monetary.js';

const zero = parseMoneyCents('0.00');

export type FundingInputs = Readonly<Record<string, {
  baseAmountCents: MoneyCents,
  fundingCategories: CentFundingRule[],
  includeFundingTransfers: boolean,
}>>;

export interface FundingAllocation {
  categoryId: number;
  amountCents: MoneyCents;
  baseAmountCents: MoneyCents;
  fundingCategories: CentFundingRule[];
  includeFundingTransfers: boolean;
  funder?: boolean;
}

export function fundingCalculationInputs(inputs: Readonly<Record<string, {
  baseAmount: string;
  fundingCategories: readonly CategorySpreadInput[];
  includeFundingTransfers: boolean;
}>>): FundingInputs {
  const cents = (value: string) => {
    if (typeof value === 'string' && value.trim() === '') throw new Error('Missing funding amount');
    return inputMoneyCents(value);
  };
  return Object.fromEntries(Object.entries(inputs).map(([id, { baseAmount, fundingCategories, ...input }]) => [id, {
    ...input,
    baseAmountCents: cents(baseAmount),
    fundingCategories: fundingCategories.map((rule): CentFundingRule => {
      if (rule.percentage) {
        const percentage = rule.amount;
        if (!Number.isFinite(percentage)) throw new Error('Invalid funding percentage');
        return { ...rule, percentage: true, amount: percentage };
      }
      const { amount, ...metadata } = rule;
      return { ...metadata, percentage: false, amountCents: cents(amount) };
    }),
  }]));
}

// Preserve the existing comparator, percentage rounding and last-rule residual recipient.
export const computeSpread = (amount: MoneyCents, fundingCategories: readonly CentFundingRule[]): Map<number, MoneyCents> => {
  let categoryAmount = addMoneyCents(amount);
  let percentSum = zero;

  // Sort the funding categories by percentage so that fixed amounts are applied before percentage amounts.
  const sortedCategories = (fundingCategories ?? []).slice().sort((a) => (a.percentage ? 1 : -1))

  const funders = new Map<number, MoneyCents>();

  for (let i = 0; i < sortedCategories.length; i += 1) {
    const fundingCategory = sortedCategories[i];
    const funding = funders.get(fundingCategory.categoryId) ?? zero;
    let fundingAmount: MoneyCents;

    if (fundingCategory.percentage) {
      if (!Number.isFinite(fundingCategory.amount)) throw new Error('Invalid funding percentage');
      fundingAmount = moneyCentsFromInteger(Math.round((fundingCategory.amount / 100.0) * categoryAmount));
      percentSum = addMoneyCents(percentSum, fundingAmount);

      // If we are on the last item and there is a remaing amount (due to rounding error)
      // then add it to the last funding amount.
      if (i === sortedCategories.length - 1 && percentSum !== categoryAmount) {
        fundingAmount = addMoneyCents(fundingAmount, subtractMoneyCents(categoryAmount, percentSum));
      }
    }
    else {
      fundingAmount = addMoneyCents(fundingCategory.amountCents);

      // Don't take more than what is left in the category amount
      if (categoryAmount < fundingAmount) {
        fundingAmount = categoryAmount
      }

      categoryAmount = subtractMoneyCents(categoryAmount, fundingAmount);
    }

    if (fundingAmount !== 0) {
      funders.set(fundingCategory.categoryId, addMoneyCents(funding, fundingAmount))
    }
  }

  return funders;
};

export const calculateFunding = (inputs: FundingInputs, fundingPoolId: number): FundingAllocation[] => {
  const categories: FundingAllocation[] = Object.keys(inputs)
    .filter((k) => parseInt(k, 10) !== fundingPoolId)
    .map((k) => {
      const categoryId = parseInt(k, 10);

      const baseAmountCents = addMoneyCents(inputs[k].baseAmountCents);
      return {
        categoryId,
        amountCents: baseAmountCents,
        fundingCategories: inputs[k].fundingCategories,
        includeFundingTransfers: inputs[k].includeFundingTransfers,
        baseAmountCents,
      }
    })

  const funders = new Map<number, MoneyCents>();

  for (const category of categories) {
    const categoryFunders = computeSpread(category.amountCents, category.fundingCategories);

    for (const [categoryId, amount] of categoryFunders) {
      const funding = funders.get(categoryId) ?? zero;
      funders.set(categoryId, addMoneyCents(funding, amount))
    }
  }

  // Adjust amounts for categories that have "include funding transfers" set to true.

  for (const category of categories) {
    if (category.includeFundingTransfers) {
      const previousFundingAmount = computeSpread(category.amountCents, category.fundingCategories);

      for (const [categoryId, amount] of previousFundingAmount) {
        const funding = funders.get(categoryId) ?? zero;
        funders.set(categoryId, subtractMoneyCents(funding, amount))
      }

      // Find funder that matches this category and add the amount.
      let sum = zero;

      for (const [categoryId, amount] of funders) {
        if (categoryId === category.categoryId) {
          sum = addMoneyCents(sum, amount);
        }
      }

      category.amountCents = addMoneyCents(category.amountCents, sum);

      const newFundingAmount = computeSpread(category.amountCents, category.fundingCategories);

      for (const [categoryId, amount] of newFundingAmount) {
        const funding = funders.get(categoryId) ?? zero;
        funders.set(categoryId, addMoneyCents(funding, amount))
      }
    }
  }

  for (const [categoryId, amount] of funders) {
    categories.push({
      categoryId,
      amountCents: subtractMoneyCents(zero, amount),
      baseAmountCents: zero,
      funder: true,
      fundingCategories: [],
      includeFundingTransfers: false,
    });
  }

  return categories;
};

// Sum posted destination and funder rows without converting to dollars.
export const fundingCategoryEffectCents = (rows: readonly Pick<FundingAllocation, 'categoryId' | 'amountCents'>[], categoryId: number): MoneyCents => (
  addMoneyCents(...rows.filter(row => row.categoryId === categoryId).map(row => row.amountCents))
);
