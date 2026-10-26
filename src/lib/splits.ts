/** Must stay aligned with backend/app/splits.py. Amounts are integer cents. */

export type ShareResult = {
  userId: string;
  amountCents: number;
  shares: number | null;
};

export class SplitError extends Error {}

export function splitEqual(totalCents: number, userIds: string[]): ShareResult[] {
  requireTotal(totalCents);
  requireUnique(userIds);
  const ordered = [...userIds].sort();
  const base = Math.floor(totalCents / ordered.length);
  const remainder = totalCents % ordered.length;
  return ordered.map((userId, index) => ({
    userId,
    amountCents: base + (index < remainder ? 1 : 0),
    shares: null,
  }));
}

export function splitShares(totalCents: number, parts: { userId: string; shares: number }[]): ShareResult[] {
  requireTotal(totalCents);
  requireUnique(parts.map((part) => part.userId));
  for (const part of parts) {
    if (!Number.isInteger(part.shares) || part.shares <= 0) {
      throw new SplitError('Shares must be positive');
    }
  }
  const totalShares = parts.reduce((sum, part) => sum + part.shares, 0);
  const rows = parts.map((part) => ({
    userId: part.userId,
    amount: Math.floor((totalCents * part.shares) / totalShares),
    shares: part.shares,
    remainder: (totalCents * part.shares) % totalShares,
  }));
  const leftover = totalCents - rows.reduce((sum, row) => sum + row.amount, 0);
  const order = rows
    .map((_, index) => index)
    .sort(
      (left, right) =>
        rows[right].remainder - rows[left].remainder || rows[left].userId.localeCompare(rows[right].userId),
    );
  for (let index = 0; index < leftover; index += 1) {
    rows[order[index]].amount += 1;
  }
  return rows.map((row) => ({
    userId: row.userId,
    amountCents: row.amount,
    shares: row.shares,
  }));
}

function requireTotal(totalCents: number) {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new SplitError('Amount must be positive');
  }
}

function requireUnique(userIds: string[]) {
  if (userIds.length === 0) throw new SplitError('Choose at least one person');
  if (new Set(userIds).size !== userIds.length) {
    throw new SplitError('Each person can only be listed once');
  }
}
