import vine from '@vinejs/vine'
import { validateFundingPercentages } from '#common/fundingPercentages'

/** Array rules run before child coercion. Preserve Vine's number/boolean handling. */
export const fundingPercentagesRule = vine.createRule((value, _options: undefined, field) => {
  if (!Array.isArray(value)) return
  const entries: { amount: number, percentage: boolean }[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || !('amount' in entry) || !('percentage' in entry)) return
    const amount = vine.helpers.asNumber(entry.amount)
    const percentage = vine.helpers.asBoolean(entry.percentage)
    // Let existing child schemas report malformed/required fields conventionally.
    if (entry.amount === undefined || entry.amount === null || entry.amount === ''
      || !Number.isFinite(amount) || percentage === null) return
    entries.push({ amount, percentage })
  }
  const issue = validateFundingPercentages(entries)
  if (issue) field.report(issue.message, issue.rule, field)
})
