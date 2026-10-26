import type { ExpenseInput, GroupDetail, GroupSummary, Me, SettlementInput } from '@/lib/types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function apiUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
}

async function request<T>(userId: string, path: string, method: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'X-User-Id': userId,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Start it, then try again.", 0);
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }
  return (await response.json()) as T;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) {
      const first = body.detail[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg.replace(/^Value error,\s*/, '');
    }
  } catch {
    // The body was not JSON.
  }
  return 'Something went wrong. Try again.';
}

export const api = {
  getMe(userId: string) {
    return request<Me>(userId, '/me', 'GET');
  },
  saveMe(userId: string, displayName: string) {
    return request<Me>(userId, '/me', 'PUT', { display_name: displayName });
  },
  listGroups(userId: string) {
    return request<GroupSummary[]>(userId, '/groups', 'GET');
  },
  createGroup(userId: string, input: { name: string; kind: 'trip' | 'house'; currency: string }) {
    return request<GroupSummary>(userId, '/groups', 'POST', input);
  },
  joinGroup(userId: string, code: string) {
    return request<GroupSummary>(userId, '/groups/join', 'POST', { code });
  },
  getGroup(userId: string, groupId: string) {
    return request<GroupDetail>(userId, `/groups/${groupId}`, 'GET');
  },
  addExpense(userId: string, groupId: string, input: ExpenseInput) {
    return request<GroupDetail>(userId, `/groups/${groupId}/expenses`, 'POST', input);
  },
  addSettlement(userId: string, groupId: string, input: SettlementInput) {
    return request<GroupDetail>(userId, `/groups/${groupId}/settlements`, 'POST', input);
  },
  async exportCsv(userId: string, groupId: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${apiUrl()}/groups/${groupId}/export.csv`, {
        headers: { Accept: 'text/csv', 'X-User-Id': userId },
      });
    } catch {
      throw new ApiError("Can't reach the server. Start it, then try again.", 0);
    }
    if (!response.ok) throw new ApiError(await readError(response), response.status);
    return response.text();
  },
};
