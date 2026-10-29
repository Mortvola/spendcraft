export interface FundingPercentageIssue {
  rule: 'fundingPercentageNumber' | 'fundingPercentageNonnegative' | 'fundingPercentagePrecision' |
    'fundingPercentageTotal'
  message: string
  index?: number
}

/** Approved individual Math.round policy, in hundredths of a percentage point. */
export function fundingPercentageUnits(value: unknown): bigint | FundingPercentageIssue {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(number)) {
    return { rule: 'fundingPercentageNumber', message:
      'Funding percentages must be finite numbers.' }
  }
  if (number < 0) {
    return { rule: 'fundingPercentageNonnegative', message:
      'Funding percentages must be nonnegative.' }
  }
  const units = Math.round(number * 100)
  if (!Number.isSafeInteger(units)) return { rule: 'fundingPercentagePrecision', message:
    'Unsafe funding percentage precision.' }
  return BigInt(units)
}

export function validateFundingPercentages(
  entries: readonly { amount: unknown, percentage: boolean }[],
): FundingPercentageIssue | undefined {
  let total = 0n
  let hasPercentage = false
  for (const [index, entry] of entries.entries()) {
    if (!entry.percentage) continue
    hasPercentage = true
    const units = fundingPercentageUnits(entry.amount)
    if (typeof units !== 'bigint') return { ...units, index }
    total += units
  }
  if (hasPercentage && total !== 10000n) {
    return { rule: 'fundingPercentageTotal', message:
      'Funding percentages must total exactly 100%.' }
  }
  return undefined
}
