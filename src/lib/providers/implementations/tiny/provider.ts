import { BaseProvider } from '@/lib/providers/core/BaseProvider';
import type { ProviderManifest } from '@/lib/providers/core/types';

import { tinyManifest } from './manifest';

/**
 * Tiny (Olist) — connected but not yet mapped.
 *
 * It declares no unified capabilities, so every unified route answers 501 with a
 * precise message instead of failing somewhere inside a mapper. Passthrough is
 * enabled, which already makes the connection useful while the mappers land.
 */
export class TinyProvider extends BaseProvider {
  readonly manifest: ProviderManifest = tinyManifest;
}
