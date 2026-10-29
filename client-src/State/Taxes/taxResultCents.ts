import { parseMoneyCents, type MoneyCents } from '../../../common/moneyCents.js';

// Preserve Amount's existing final-display rounding; never feed this back into a worksheet.
export function taxResultCents(value: number | null | undefined): MoneyCents {
  const amount = value ?? 0;
  if (!Number.isFinite(amount)) throw new Error('Invalid tax result');
  const displayed = amount.toFixed(2);
  return parseMoneyCents(displayed === '-0.00' ? '0.00' : displayed);
}
