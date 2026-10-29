import type { DecimalMoneyString } from './ResponseTypes.js';

declare const moneyCentsBrand: unique symbol;
export type MoneyCents = number & { readonly [moneyCentsBrand]: true };

const limit = BigInt(Number.MAX_SAFE_INTEGER);

function checkedCents(value: bigint): MoneyCents {
  if (value > limit || value < -limit) throw new Error('Unsafe monetary cents');
  // The brand is constructed only after checking the exact integer range.
  return Number(value) as MoneyCents;
}

function integerCents(value: MoneyCents): bigint {
  if (!Number.isSafeInteger(value)) throw new Error('Invalid monetary cents');
  return BigInt(value);
}

// Construct cents from an already-rounded integer, without dollar conversion.
export function moneyCentsFromInteger(value: number): MoneyCents {
  if (!Number.isSafeInteger(value)) throw new Error('Invalid monetary cents');
  return checkedCents(BigInt(value));
}

// Match the canonical API format, parsing decimal digits without floating-point scaling.
export function parseMoneyCents(value: unknown): MoneyCents {
  if (typeof value !== 'string' || value.length > 24 || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value) || value === '-0.00') {
    throw new Error('Invalid canonical monetary string');
  }
  const negative = value.startsWith('-');
  const [whole, fraction] = value.replace(/^-/, '').split('.');
  return checkedCents((BigInt(whole) * 100n + BigInt(fraction)) * (negative ? -1n : 1n));
}

export function addMoneyCents(...values: readonly MoneyCents[]): MoneyCents {
  return checkedCents(values.reduce((sum, value) => sum + integerCents(value), 0n));
}

export function subtractMoneyCents(left: MoneyCents, right: MoneyCents): MoneyCents {
  return checkedCents(integerCents(left) - integerCents(right));
}

export function formatMoneyCents(value: MoneyCents): DecimalMoneyString {
  const cents = integerCents(value);
  const magnitude = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
}
