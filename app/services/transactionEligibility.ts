import { encodeMonetaryAmount } from './categoryAmountCodec.ts';
import type { DateTime } from 'luxon';
import { addMoneyCents, subtractMoneyCents, parseMoneyCents, type MoneyCents } from
  '#common/moneyCents';

interface OrdinaryState {
  date: DateTime;
  deleted: boolean;
  pending: boolean;
}

export function categoryEligible(state: OrdinaryState, startDate: DateTime): boolean {
  return !state.deleted && state.date >= startDate;
}

export function accountEligible(state: OrdinaryState, startDate: DateTime): boolean {
  return categoryEligible(state, startDate) && !state.pending;
}

interface Allocation {
  categoryId: number;
  amount: number;
}

// Sum duplicate IDs without changing the nominal JSON allocation or its order.
export function categoryEffectDeltas(
  oldSplits: readonly { categoryId: number; amountCents: MoneyCents }[],
  newSplits: readonly { categoryId: number; amountCents: MoneyCents }[],
  oldEligible: boolean, newEligible: boolean): Map<number, MoneyCents> {
  const zero = parseMoneyCents('0.00');
  const before = new Map<number, MoneyCents>();
  const after = new Map<number, MoneyCents>();
  for (const [splits, eligible, totals] of [[oldSplits, oldEligible, before],
    [newSplits, newEligible, after]] as const) {
    if (!eligible) continue;
    for (const split of splits) totals.set(split.categoryId,
      addMoneyCents(totals.get(split.categoryId) ?? zero, split.amountCents));
  }
  return new Map([...new Set([...before.keys(), ...after.keys()])]
    .map(id => [id, subtractMoneyCents(after.get(id) ?? zero, before.get(id) ?? zero)]));
}

// Loan-excluded allocations keep numeric JSON; only their balance effects use cents.
export function excludedCategoryEffectDeltas(oldSplits: readonly Allocation[],
  newSplits: readonly Allocation[],
  oldEligible: boolean, newEligible: boolean): Map<number, MoneyCents> {
  const centAllocations = (splits: readonly Allocation[]) => splits.map(split => ({
    categoryId: split.categoryId,
    amountCents: parseMoneyCents(encodeMonetaryAmount(split.amount)),
  }));
  return categoryEffectDeltas(centAllocations(oldSplits), centAllocations(newSplits),
    oldEligible, newEligible);
}
