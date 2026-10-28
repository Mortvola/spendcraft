import type { DecimalMoneyString, FundingRuleResponse, NetworthReportResponse } from '../common/ResponseTypes.js';

// Encode at the request boundary; client state and calculations remain numeric.
export function encodeAmount(value: number): DecimalMoneyString {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid monetary request');
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) throw new Error('Unsafe monetary request');
  const encoded = (cents / 100).toFixed(2);
  if (Math.round(decodeAmount(encoded) * 100) !== (cents === 0 ? 0 : cents)) throw new Error('Unsafe monetary request');
  return encoded;
}

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

export function decodeNetworthReport(rows: NetworthReportResponse): (string | number)[][] {
  return rows.map((row, index) => row.map((cell, column) => index === 0 || column === 0 ? cell : decodeAmount(cell)));
}
