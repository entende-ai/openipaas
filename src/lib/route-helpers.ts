import { NextResponse } from 'next/server';
import { ProviderError } from './providers/core/errors';
import type { UnifiedProvider } from './providers/core/types';

/**
 * Resolves a provider method by name, raising the standard 501 when the
 * provider does not implement it.
 *
 * This is what removes `switch (provider)` from the routes: a route asks for a
 * capability, and the registry decides whether the connected provider has it.
 */
export type AnyFn = (...args: any[]) => any;

export function callable<T extends AnyFn = AnyFn>(
  provider: UnifiedProvider,
  method: string,
  label: string
): T {
  const fn = (provider as any)[method];
  if (typeof fn !== 'function') {
    throw new ProviderError('NOT_SUPPORTED', `${provider.manifest.name} does not support ${label}.`, {
      provider: provider.manifest.slug,
    });
  }
  return fn.bind(provider) as T;
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data as any, { status });
}

/** Methods a route declares but the unified contract does not cover yet. */
export function notImplemented(label: string): never {
  throw new ProviderError('NOT_SUPPORTED', `${label} is not available on this endpoint.`);
}
