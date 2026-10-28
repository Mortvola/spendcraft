import type { FundingRuleResponse } from '../common/ResponseTypes';

// Decode canonical API amounts before using them in numeric client state.
export function decodeAmount(value: unknown): number {
  if (typeof value !== 'string' || value.length > 24 || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value) || value === '-0.00') {
    throw new Error('Invalid monetary response');
  }
  const negative = value.startsWith('-');
  const [whole, fraction] = value.replace(/^-/, '').split('.');
  const cents = (BigInt(whole) * 100n + BigInt(fraction)) * (negative ? -1n : 1n);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Unsafe monetary response');
  }
  const amount = Number(cents) / 100;
  if (Math.round(amount * 100) !== Number(cents)) throw new Error('Unsafe monetary response');
  return amount;
}


export function decodeFundingRules<T extends FundingRuleResponse>(rules: readonly T[]): (Omit<T, 'amount'> & { amount: number })[] {
  return rules.map((rule) => {
    if (rule.percentage === true) {
      if (typeof rule.amount !== 'number' || !Number.isFinite(rule.amount)) {
        throw new Error('Invalid percentage response');
      }
      return { ...rule, amount: rule.amount };
    }
    return { ...rule, amount: decodeAmount(rule.amount) };
  });
}
