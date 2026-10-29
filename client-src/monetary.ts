import { formatMoneyCents, parseMoneyCents, subtractMoneyCents, type MoneyCents } from '../common/moneyCents.js';
import type { CategoryTransferProps, CategoryTransferRequest, DecimalMoneyString, FundingRuleResponse, NetworthReportResponse } from '../common/ResponseTypes.js';

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


export function encodeFundingRules<T extends { categoryId: number; amount: number; percentage: boolean }>(rules: readonly T[]): (Omit<T, 'amount' | 'percentage'> & FundingRuleResponse)[] {
  return rules.map(rule => {
    if (rule.percentage === true) {
      if (typeof rule.amount !== 'number' || !Number.isFinite(rule.amount)) throw new Error('Invalid percentage request');
      return { ...rule, percentage: true, amount: rule.amount };
    }
    if (rule.percentage !== false) throw new Error('Invalid funding mode request');
    return { ...rule, percentage: false, amount: encodeAmount(rule.amount) };
  });
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

export type CentFundingRule = { id?: number; categoryId: number } & (
  { percentage: true; amount: number } | { percentage: false; amountCents: MoneyCents }
);

export function decodeCentFundingRules(rules: readonly FundingRuleResponse[]): CentFundingRule[] {
  return rules.map(({ amount, ...rule }) => {
    if (rule.percentage === true) {
      if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new Error('Invalid percentage response');
      return { ...rule, percentage: true, amount };
    }
    if (rule.percentage !== false) throw new Error('Invalid funding mode response');
    return { ...rule, percentage: false, amountCents: parseMoneyCents(amount) };
  });
}

export function encodeCentFundingRules(rules: readonly CentFundingRule[]): FundingRuleResponse[] {
  return rules.map(rule => {
    if (rule.percentage === true) {
      const { amount, ...metadata } = rule;
      if (!Number.isFinite(amount)) throw new Error('Invalid percentage request');
      return { ...metadata, percentage: true, amount };
    }
    if (rule.percentage !== false) throw new Error('Invalid funding mode request');
    const { amountCents, ...metadata } = rule;
    return { ...metadata, percentage: false, amount: formatMoneyCents(amountCents) };
  });
}

export function decodeNetworthReport(rows: NetworthReportResponse): (string | number)[][] {
  return rows.map((row, index) => row.map((cell, column) => index === 0 || column === 0 ? cell : decodeAmount(cell)));
}

// Funding metadata stays numeric in editors; only fixed-dollar values cross as strings.
export type TransferCategoryInput = Omit<CategoryTransferProps, 'amount'> & { amount: number | DecimalMoneyString };

export function encodeTransferCategories(categories: readonly TransferCategoryInput[]): CategoryTransferRequest['categories'] {
  return categories.map(({ amount, baseAmount, fundingCategories, ...category }) => ({
    ...category,
    amount: typeof amount === 'string' ? formatMoneyCents(parseMoneyCents(amount)) : encodeAmount(amount),
    ...(baseAmount === undefined ? {} : { baseAmount: encodeAmount(baseAmount) }),
    ...(fundingCategories === undefined ? {} : { fundingCategories: encodeFundingRules(fundingCategories) }),
  }));
}

// UI fields may contain unrounded input; canonical strings retain every original cent.
export function inputMoneyCents(value: string | number, sign = 1): MoneyCents {
  if (typeof value === 'string' && value !== '-0.00' && /^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
    const cents = parseMoneyCents(value);
    return sign === -1 ? subtractMoneyCents(parseMoneyCents('0.00'), cents) : cents;
  }
  return parseMoneyCents(encodeAmount(Number(value) * sign));
}
