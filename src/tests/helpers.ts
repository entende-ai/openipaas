import { vi } from 'vitest';
import type { ProviderContext } from '@/lib/providers/core/types';

export function makeContext(overrides: Partial<ProviderContext> = {}): ProviderContext {
  return {
    credentialId: 'cred-1',
    provider: 'TEST',
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    instanceUrl: null,
    externalTenantId: null,
    secrets: {},
    ...overrides,
  };
}

export interface RecordedCall {
  url: string;
  method: string;
  auth: string;
  body: any;
}

export interface FetchStub {
  calls: RecordedCall[];
  fetch: typeof fetch;
}

/**
 * Scripted fetch stub. `responses` is consumed one entry per call; the last
 * entry repeats once exhausted, so a steady-state response is easy to express.
 */
export function stubFetch(
  responses: Array<{ status?: number; json?: unknown; text?: string; buffer?: Uint8Array; headers?: Record<string, string> }>
): FetchStub {
  const calls: RecordedCall[] = [];
  let index = 0;

  const impl = vi.fn(async (url: any, init: any) => {
    const spec = responses[Math.min(index, responses.length - 1)];
    index += 1;

    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      auth: init?.headers?.Authorization ?? '',
      body: init?.body ? JSON.parse(init.body) : null,
    });

    const status = spec.status ?? 200;
    const payload = spec.text ?? (spec.json !== undefined ? JSON.stringify(spec.json) : '');

    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h: string) => spec.headers?.[h] ?? null },
      text: async () => payload,
      arrayBuffer: async () => (spec.buffer ?? new Uint8Array()).buffer,
    } as any;
  });

  return { calls, fetch: impl as unknown as typeof fetch };
}

/** Deterministic, instant sleeps so retry/backoff tests do not wait. */
export const noSleep = async (_ms: number) => {};
