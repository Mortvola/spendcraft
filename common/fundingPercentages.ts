export interface FundingPercentageIssue {
  rule: 'fundingPercentageNumber' | 'fundingPercentageNonnegative' | 'fundingPercentagePrecision' | 'fundingPercentageTotal'
  message: string
  index?: number
}

/** Exact hundredths of a percentage point; never round finer precision. */
export function fundingPercentageUnits(value: unknown): bigint | FundingPercentageIssue {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(number)) {
    return { rule: 'fundingPercentageNumber', message: 'Funding percentages must be finite numbers.' }
  }
  if (number < 0) {
    return { rule: 'fundingPercentageNonnegative', message: 'Funding percentages must be nonnegative.' }
  }
  const [mantissa, exponent = '0'] = number.toString().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const digits = whole + fraction
  const shift = 2 + Number(exponent) - fraction.length
  if (shift >= 0) return BigInt(digits) * 10n ** BigInt(shift)
  const places = -shift
  if (places > digits.length || !digits.endsWith('0'.repeat(places))) {
    return { rule: 'fundingPercentagePrecision', message: 'Funding percentages support at most two decimal places.' }
  }
  return BigInt(digits.slice(0, digits.length - places) || '0')
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
    return { rule: 'fundingPercentageTotal', message: 'Funding percentages must total exactly 100%.' }
  }
  return undefined
}
