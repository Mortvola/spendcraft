// Historical test-only preview from 7ebc714; never used by production.
import { computeSpread, type FundingInputs } from '../../../client-src/Funding/calculateFunding.js';

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

        const funders = computeSpread(sum2, cat.fundingCategories)
        const funderAmount = funders.get(fundingCatId)

        if (funderAmount !== undefined) {
          sum += funderAmount / 100.0
        }
      }
    }
  }

  return sum;
};
