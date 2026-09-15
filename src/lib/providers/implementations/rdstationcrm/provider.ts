import { BaseProvider } from '@/lib/providers/core/BaseProvider';
import type { ProviderManifest } from '@/lib/providers/core/types';

import { rdStationCrmManifest } from './manifest';

/**
 * RD Station CRM provider.
 *
 * Passthrough only for now: a call to /passthrough/contacts reaches
 * https://api.rd.services/crm/v2/contacts with the account's bearer token, and
 * BaseProvider supplies throttling, retries and renewal on expiry.
 *
 * What the unified CRM resources will have to handle, from the v2 docs:
 *   - pagination is JSON:API style, `page[number]` and `page[size]` (default
 *     20), with a `links` object holding first, prev, self, next and last;
 *   - filtering uses RDQL;
 *   - errors arrive as an `errors` array alongside the HTTP status.
 */
export class RdStationCrmProvider extends BaseProvider {
  readonly manifest: ProviderManifest = rdStationCrmManifest;
}
