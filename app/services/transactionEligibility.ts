import type { DateTime } from 'luxon';

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
export function categoryEffectDeltas(oldSplits: readonly Allocation[], newSplits: readonly Allocation[],
  oldEligible: boolean, newEligible: boolean): Map<number, number> {
  const before = new Map<number, number>();
  const after = new Map<number, number>();
  for (const [splits, eligible, totals] of [[oldSplits, oldEligible, before],
    [newSplits, newEligible, after]] as const) {
    if (!eligible) continue;
    for (const split of splits) totals.set(split.categoryId, (totals.get(split.categoryId) ?? 0) + split.amount);
  }
  return new Map([...new Set([...before.keys(), ...after.keys()])]
    .map((id) => [id, (after.get(id) ?? 0) - (before.get(id) ?? 0)]));
}
