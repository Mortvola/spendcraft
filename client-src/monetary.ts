import { addMoneyCents, formatMoneyCents, parseMoneyCents, subtractMoneyCents, type MoneyCents } from '../common/moneyCents.js';
import type { CategoryReportRow, CategoryTransferProps, CategoryTransferRequest, DecimalMoneyString, FundingRuleResponse, FundingHistoryReportResponse, FundingHistoryReportRow, IncomeVsExpensesReportResponse, NetworthReportResponse, PayeeReportRow } from '../common/ResponseTypes.js';

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

export interface FundingHistoryCentsItem { year: number; month: number; amountCents: MoneyCents }
export type FundingHistoryCentsRow = Omit<FundingHistoryReportRow, 'history'> & { history: FundingHistoryCentsItem[] | null };

export function decodeFundingHistoryReport(rows: FundingHistoryReportResponse): FundingHistoryCentsRow[] {
  return rows.map(row => ({ ...row, history: row.history === null ? null : row.history.map(({ amount, ...entry }) => ({
    ...entry, amountCents: parseMoneyCents(amount),
  })) }));
}

export function fundingHistoryTotals(rows: readonly FundingHistoryCentsRow[]): FundingHistoryCentsItem[] {
  const totals: FundingHistoryCentsItem[] = [];
  for (const row of rows) {
    for (const entry of row.history ?? []) {
      const total = totals.find(t => t.year === entry.year && t.month === entry.month);
      if (total) total.amountCents = addMoneyCents(total.amountCents, entry.amountCents);
      else totals.push({ ...entry });
    }
  }
  return totals;
}

export type IncomeVsExpensesCentsRow = [month: string, incomeCents: MoneyCents, expensesCents: MoneyCents, netCents: MoneyCents];

export function decodeIncomeVsExpensesReport(rows: IncomeVsExpensesReportResponse): IncomeVsExpensesCentsRow[] {
  return rows.map(([month, income, expenses, net]) => [month, parseMoneyCents(income), parseMoneyCents(expenses), parseMoneyCents(net)]);
}

export type CategoryCentsReportRow = Omit<CategoryReportRow, 'sum'> & { sumCents: MoneyCents };

export function decodeCategoryReport(rows: readonly CategoryReportRow[]): CategoryCentsReportRow[] {
  return rows.map(({ sum, ...row }) => ({ ...row, sumCents: parseMoneyCents(sum) }));
}

export type PayeeCentsReportRow = Omit<PayeeReportRow, 'sum'> & { sumCents: MoneyCents };

export function decodePayeeReport(rows: readonly PayeeReportRow[]): PayeeCentsReportRow[] {
  return rows.map(({ sum, ...row }) => ({ ...row, sumCents: parseMoneyCents(sum) }));
}

export type NetworthCentsReport = (string | MoneyCents)[][];

export function decodeNetworthReport(rows: NetworthReportResponse): NetworthCentsReport {
  return rows.map((row, index) => row.map((cell, column) => index === 0 || column === 0 ? cell : parseMoneyCents(cell)));
}

export function networthTotals(rows: NetworthCentsReport): NetworthCentsReport {
  return rows.map((row, index) => index === 0
    ? [...row, 'Net Worth']
    : [...row, addMoneyCents(...row.filter((cell): cell is MoneyCents => typeof cell === 'number'))]);
}

// Google Charts requires numeric coordinates; formatted labels retain the exact cents.
export function networthChartData(rows: NetworthCentsReport) {
  return rows.map(row => row.map(cell => typeof cell === 'string' ? cell : {
    v: Number(formatMoneyCents(cell)),
    f: formatMoneyCents(cell).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,'),
  }));
}

export type TransferCategoryInput = Omit<CategoryTransferProps, 'amount' | 'baseAmount' | 'fundingCategories'> & {
  amount: DecimalMoneyString;
  baseAmountCents?: MoneyCents;
  fundingCategories?: CentFundingRule[];
};

export function encodeTransferCategories(categories: readonly TransferCategoryInput[]): CategoryTransferRequest['categories'] {
  return categories.map(({ amount, baseAmountCents, fundingCategories, ...category }) => {
    if ('baseAmount' in category) throw new Error('Expected cent-based transfer metadata');
    return {
      ...category,
      amount: formatMoneyCents(parseMoneyCents(amount)),
      ...(baseAmountCents === undefined ? {} : { baseAmount: formatMoneyCents(baseAmountCents) }),
      ...(fundingCategories === undefined ? {} : { fundingCategories: encodeCentFundingRules(fundingCategories) }),
    };
  });
}

// UI fields may contain unrounded input; canonical strings retain every original cent.
export function inputMoneyCents(value: string | number, sign = 1): MoneyCents {
  if (typeof value === 'string' && value !== '-0.00' && /^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
    const cents = parseMoneyCents(value);
    return sign === -1 ? subtractMoneyCents(parseMoneyCents('0.00'), cents) : cents;
  }
  return parseMoneyCents(encodeAmount(Number(value) * sign));
}
