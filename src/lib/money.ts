const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  CAD: 'CA$',
  AUD: 'A$',
};

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] as const;

export function formatMoney(cents: number, currency: string): string {
  const negative = cents < 0;
  const absolute = Math.abs(Math.trunc(cents));
  const major = Math.floor(absolute / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const minor = String(absolute % 100).padStart(2, '0');
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  return `${negative ? '-' : ''}${symbol}${major}.${minor}`;
}

export function centsToInput(cents: number): string {
  const absolute = Math.abs(Math.trunc(cents));
  return `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

/** Parse a money field into cents. Empty and invalid input return null. Zero is rejected. */
export function parseCents(input: string): number | null {
  const cents = parseCentsAllowZero(input);
  if (cents == null || cents <= 0) return null;
  return cents;
}

export function parseCentsAllowZero(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '');
  if (!cleaned) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [major, minor = ''] = cleaned.split('.');
  const cents = Number(major) * 100 + Number(minor.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000) return null;
  return cents;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function balancePhrase(cents: number, currency: string): string {
  if (cents > 0) return `You are owed ${formatMoney(cents, currency)}`;
  if (cents < 0) return `You owe ${formatMoney(Math.abs(cents), currency)}`;
  return 'You are settled up';
}
