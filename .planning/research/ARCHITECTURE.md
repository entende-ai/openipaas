# Architecture Research

**Domain:** Unified API / iPaaS platform for business applications  
**Researched:** 2026-05-24  
**Confidence:** HIGH for component boundaries and data-flow patterns; MEDIUM for exact implementation sequencing because this is brownfield and phase sizing depends on roadmap appetite.

## Standard Architecture

### System Overview

Unified API/iPaaS platforms are usually structured as a stable public contract in front of many provider-specific integrations. The common pattern across Merge, Apideck, and Nango is:

- A **tenant/consumer + connected account** model that identifies the customer and the external account being accessed.
- A **connect/auth layer** that handles OAuth/API-key setup, credential storage, token refresh, and connection lifecycle.
- A **unified API surface** organized by category/domain, not provider.
- A **common/canonical model layer** with explicit escape hatches for raw/provider-specific data, custom fields, field mappings, or passthrough calls.
- A **connector runtime** that owns provider HTTP behavior, pagination, rate limits, retries, timeouts, webhooks, and sync execution.
- A **capability/catalog layer** so docs and runtime behavior know which providers support which resources and operations.
- An **operations plane** for dashboard setup, logs, audit trails, credential health, and integration observability.

Recommended target shape for Open iPaaS:

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Public/API Plane                                                       │
│  /api/unified/v1/{domain}/{resource}  │  OpenAPI docs  │  SDK-ready UX │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ stable canonical request/response DTOs
┌───────────────────────────────▼───────────────────────────────────────┐
│ Contract Plane                                                         │
│  Canonical models │ Request schemas │ Error envelope │ Capability gates │
│  Versioning rules │ Field extensions │ Raw/debug policy               │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ operation contract + account context
┌───────────────────────────────▼───────────────────────────────────────┐
│ Integration Runtime Plane                                              │
│  Provider registry │ Adapter interface │ Provider HTTP client          │
│  Mapper layer      │ Retry/timeout/rate-limit policy │ Token refresh    │
└───────────────┬───────────────────────────────┬───────────────────────┘
                │                               │
┌───────────────▼──────────────┐   ┌────────────▼───────────────────────┐
│ Connection/Security Plane     │   │ Async/Sync Plane (later)            │
│ Clients, API keys, accounts   │   │ Jobs, webhooks, incremental syncs   │
│ OAuth state, encrypted tokens │   │ checkpoints, record cache, events   │
└───────────────┬──────────────┘   └────────────┬───────────────────────┘
                │                               │
┌───────────────▼───────────────────────────────▼───────────────────────┐
│ Data/Operations Plane                                                  │
│ PostgreSQL/Prisma │ Audit log │ Request logs │ Dashboard │ Health UI    │
└───────────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────────┐
│ External Provider APIs                                                 │
│ Conta Azul │ Omie │ Tiny │ future ERP/CRM/ecommerce/finance/logistics │
└───────────────────────────────────────────────────────────────────────┘
```

This fits the current Next.js/Prisma monolith. Do **not** split into microservices for v1. Instead, create stronger internal module boundaries inside `src/lib/` and keep the public route tree backward-compatible.

## Component Boundaries to Adopt Next

| Component | Responsibility | Boundary Rule | Current Fit / Change Needed |
|-----------|----------------|---------------|-----------------------------|
| Public Unified Routes | HTTP shape, auth wrapper, request parsing, response status | Must not branch by provider or know upstream paths | Keep `src/app/api/unified/v1/**`; refactor provider-specific branches out of route handlers. |
| Contract & Schema Layer | Canonical types, Zod request/response schemas, public error envelope, pagination conventions | Owns the external contract; provider adapters must conform to it | Expand `src/types/unified.ts` and `src/lib/validations/unified-schemas.ts`; add request/query schemas, not only mapper output schemas. |
| Capability Registry | Declares provider/category/resource/operation support, status, docs visibility, auth mode, beta flags | Docs and runtime checks read the same metadata | Replace hardcoded `ProviderFactory` switch with provider modules exporting metadata plus implementation. Unsupported operations return stable `501`/capability errors before provider call. |
| Provider Adapter | Implements canonical operations for one provider | May know provider API details; may not shape public HTTP responses | Keep `IUnifiedProvider`, but evolve it into domain-specific operation groups and typed inputs/outputs. |
| Provider HTTP Client | Fetch wrapper for upstream APIs: auth injection, timeouts, retries, token refresh, rate-limit parsing, redaction | Providers use this instead of direct `fetch` helpers | Introduce shared client; migrate `unified-api-utils.ts`, `omie-utils.ts`, PDF flow, and token refresh into it. |
| Mapper/Normalizer | Converts provider payloads into canonical models and provider payloads from canonical writes | Pure, typed transformations with fixtures and tests | Keep `src/lib/mappers/**`; stop returning raw payloads by default. Use `unknown`/redacted raw data behind explicit option. |
| Connection & Credential Store | Client/account identity, account token, credential records, OAuth state, key lifecycle | Owns secrets; routes/providers receive safe credential handles/decoded secret only where needed | Extend Prisma models for hashed API keys, encrypted OAuth/provider credentials, OAuth nonce/state, connection status. |
| Operations Dashboard | Internal setup, connection lifecycle, logs, capability visibility, test calls | Must be authenticated and authorized before unblocking | Keep dashboard in monolith but add admin auth + action authorization before enabling. |
| OpenAPI/Docs Generator | Developer-facing spec from contract and capability metadata | Docs must not be hand-maintained separately from runtime support | Replace or supplement `src/lib/openapi.ts` with generation/tests from schema + capability registry. |
| Async Integration Runtime | Bulk jobs, syncs, webhooks, retries, checkpoints, record cache | Optional for v1 synchronous API; required before high-volume sync promises | Defer full queue/record cache until after stable connector contract and provider HTTP client. |

## Recommended Project Structure

Keep the Next.js route locations stable, but reorganize integration internals around contracts, providers, and runtime concerns:

```text
src/
├── app/
│   └── api/unified/v1/**        # Thin HTTP handlers; backward-compatible paths
├── lib/
│   ├── unified/
│   │   ├── contracts/           # canonical models, request schemas, response envelopes
│   │   ├── capabilities/        # provider/resource/operation registry
│   │   ├── errors/              # public error codes + provider error mapping
│   │   └── docs/                # OpenAPI generation from contracts/capabilities
│   ├── integrations/
│   │   ├── runtime/             # provider HTTP client, retries, rate limits, token refresh
│   │   ├── registry.ts          # generated/static provider registry
│   │   └── providers/
│   │       ├── conta-azul/      # provider module: metadata, adapter, mappers, auth config
│   │       ├── omie/
│   │       └── tiny/
│   ├── connections/             # account token resolution, credentials, OAuth state
│   ├── audit/                   # audit events and request logs
│   └── prisma.ts
├── types/                       # public exported TS types if still useful
└── tests/
    ├── contracts/               # route/docs/capability contract tests
    ├── providers/               # provider conformance tests
    └── fixtures/                # provider payload fixtures
```

### Structure Rationale

- **`src/app/api/unified/v1/**` stays stable** because existing API consumers should not be forced to change URLs while internals evolve.
- **`lib/unified` owns public contracts** so external behavior is not scattered across routes, mappers, and OpenAPI definitions.
- **`lib/integrations` owns provider mechanics** so adding apps variados does not require route edits.
- **`connections` is separate from providers** because tenant/account resolution, API key hashing, OAuth state, and secret encryption are platform concerns, not connector concerns.
- **Provider modules should be self-describing**: metadata + capabilities + adapter + mappers + auth config + tests. This preserves the current provider adapter architecture while making it extensible.

## Architectural Patterns

### Pattern 1: Thin Route, Capability Gate, Adapter Dispatch

**What:** Route handlers authenticate, validate canonical request DTOs, check provider capabilities, invoke a provider adapter operation, then serialize a standard response/error envelope.

**Why:** Existing routes sometimes branch on `linkedAccount.provider`, which makes every provider addition a route change. Unified API platforms keep the public API provider-agnostic and isolate provider differences behind connector contracts.

**Example:**

```typescript
export const GET = withUnifiedAuth(async (req, ctx) => {
  const query = ListCustomersQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
  const provider = providerRegistry.resolve(ctx.linkedAccount.provider);

  requireCapability(provider, 'customers.list');

  const result = await provider.customers.list({
    account: ctx.accountRef,
    credentials: ctx.credentialRef,
    query,
  });

  return unifiedJson(CustomerListResponse.parse(result));
});
```

**Trade-offs:** Slightly more internal plumbing, but it prevents provider-specific route drift and makes conformance tests possible.

### Pattern 2: Provider Module as Plugin, Not Just Class

**What:** Each provider exports metadata, capabilities, auth configuration, mappers, and an adapter implementation.

**Why:** iPaaS platforms need more than methods. They need to know whether a provider supports `sales.getPdf`, which auth mode it uses, which scopes are required, what docs should show, and which tests prove readiness.

**Example:**

```typescript
export const contaAzulConnector = defineConnector({
  id: 'CONTA_AZUL',
  displayName: 'Conta Azul',
  categories: ['erp', 'accounting'],
  auth: { type: 'oauth2', supportsRefresh: true },
  capabilities: {
    customers: { list: 'stable', get: 'stable', create: 'stable', deleteBulk: 'beta' },
    products: { list: 'stable', get: 'stable' },
    sales: { list: 'stable', get: 'stable', getPdf: 'stable' },
  },
  adapter: new ContaAzulProvider(),
});
```

**Trade-offs:** A registry requires discipline and generation/tests, but it unlocks provider catalogue growth and docs/runtime alignment.

### Pattern 3: Common Model + Explicit Extensions

**What:** Normalize core fields into canonical models, but expose provider-specific/custom data through intentional extension points rather than pretending all providers fit perfectly.

**Why:** Nango explicitly recommends a stable common model with provider extensions over lowest-common-denominator overfitting. Merge and Apideck both offer supplemental/raw/field-mapping mechanisms for data outside common models.

**Recommended policy for Open iPaaS:**

- Default response: canonical fields only plus stable `remoteId`/provider identity fields.
- Optional debug/admin mode: redacted `remoteData` included only when requested and authorized.
- Custom/provider fields: `customFields` or `extensions[providerId]` with documented stability guarantees.
- Writes: validate canonical write DTOs first; use provider-specific validation metadata for required-provider-field differences.

### Pattern 4: Shared Provider HTTP Client

**What:** One runtime client wraps upstream `fetch` with timeout, retry/backoff, token refresh, rate-limit extraction, redacted logging, and structured provider errors.

**Why:** Apideck standardizes downstream rate-limit headers because providers expose rate limits inconsistently. Nango treats retries, rate limits, and observability as runtime platform concerns. Open iPaaS currently lacks shared timeout/retry/circuit behavior and has a token-refresh PDF gap.

**Boundary:** Provider adapters build provider-specific endpoints/payloads; the HTTP client owns cross-cutting network behavior.

### Pattern 5: Docs From Contract Metadata

**What:** Generate or verify OpenAPI paths/schemas from canonical schemas and capability metadata.

**Why:** Current OpenAPI docs can document operations that route/provider code does not implement. Unified API trust depends on documentation matching runtime behavior.

**Minimum v1 approach:** Keep `src/lib/openapi.ts`, but add tests that fail when documented methods are unsupported or absent from route/capability metadata. Full generation can come later.

## Data Flow

### Synchronous Unified API Request Flow

```text
External developer
  │ Authorization + X-Account-Token
  ▼
Next.js route handler (/api/unified/v1/...)
  │
  ├─► withUnifiedAuth: API key hash lookup + account-token ownership check
  │
  ├─► Request schema validation: query/body/path DTOs
  │
  ├─► Provider registry: resolve provider module from linked account
  │
  ├─► Capability gate: is resource.operation supported for this provider?
  │       └─ unsupported → stable public 501/capability error
  │
  ├─► Provider adapter operation
  │       ├─► Provider HTTP client
  │       │     ├─ decrypt/inject credential where required
  │       │     ├─ timeout + retry/backoff + rate-limit handling
  │       │     ├─ token refresh with concurrency guard
  │       │     └─ redacted provider error mapping
  │       └─► External provider API
  │
  ├─► Mapper/normalizer: provider payload → canonical model
  │
  ├─► Response schema validation
  │
  └─► Standard JSON response/error envelope + audit/request log
```

### Connection/OAuth Flow

```text
Authenticated dashboard admin
  ▼
Create connect session / signed OAuth state
  ▼
Provider authorization page
  ▼
OAuth callback
  ├─► verify nonce/signature/expiry/session/client binding
  ├─► exchange code for tokens
  ├─► encrypt and persist credentials
  ├─► upsert linked account and connection status
  └─► audit event + dashboard redirect
```

Current code treats OAuth `state` as `clientId`; this should be replaced before dashboard connection flows are considered safe.

### Future Async Sync/Webhook Flow

```text
Provider webhook or scheduled job
  ▼
Connection + capability lookup
  ▼
Sync worker/job
  ├─► provider HTTP client with checkpoints/rate limits
  ├─► mapper/normalizer
  ├─► record cache or change event table
  └─► webhook/event to Open iPaaS consumer or dashboard status
```

Do not make this the first architecture change. Build the synchronous connector contract and provider runtime first; async syncs depend on those boundaries.

## Suggested Build Order

1. **Contract Stabilization and Route Thinning**
   - Define request/response/error envelopes and enforce Zod validation at API edges.
   - Move provider-specific branches from routes into provider adapters.
   - Add route/contract tests for current customers/products/sales paths so existing consumers do not break.

2. **Capability Registry + Provider Module Boundary**
   - Convert `ProviderFactory` into a registry of provider modules with metadata and capabilities.
   - Make unsupported operations deterministic (`501` or documented capability error), not generic `500`.
   - Update provider generator to create metadata, capability declarations, registration, and failing conformance tests until implemented.

3. **Shared Provider Runtime Client**
   - Centralize upstream fetch behavior: timeouts, retries, rate-limit parsing, token refresh, redaction, structured errors.
   - Fix PDF token refresh and token refresh race protection here, not route-by-route.

4. **Credential and Dashboard Security Boundary**
   - Hash API keys, encrypt OAuth/provider credentials, add OAuth state records, admin auth, action authorization, and audit logging.
   - Only then unblock dashboard routes for operational use.

5. **Docs/Capability Alignment**
   - Generate or test OpenAPI from schemas + capabilities.
   - Surface provider support status in docs/dashboard so developers know what is stable, beta, or unsupported.

6. **Provider Expansion MVP**
   - Add the next real provider through the new module boundary.
   - Use conformance tests to prove scaffold + explicit implementation flow.

7. **Async Jobs, Webhooks, and Syncs**
   - Add queues/checkpoints/record cache only after synchronous operations, capabilities, and credential safety are solid.
   - Start with bulk operations or incremental read sync for one domain rather than all resources.

## Fit With Current Provider Adapter Architecture

The current `IUnifiedProvider` + `ProviderFactory` + implementations is the right seed architecture. The next step is **not replacement**; it is hardening the adapter boundary:

- Keep `IUnifiedProvider`, but split it into typed domain capabilities (`customers`, `products`, `sales`, later `finance`, `crm`, `commerce`) rather than a growing flat interface with `any` parameters.
- Keep provider implementations, but move provider-specific request helpers and mappers inside provider modules or clearly named runtime/mapper submodules.
- Replace `ProviderFactory`'s hardcoded switch with a registry that can be generated/validated.
- Keep route paths stable and use the adapter for every provider-specific operation.
- Keep mappers pure and fixture-tested; add conformance tests that every provider either implements or explicitly rejects each advertised operation.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-10 providers / low volume | Next.js/Prisma monolith is fine. Focus on contracts, capabilities, credential safety, and tests. |
| 10-50 providers / moderate volume | Add generated provider registry, shared HTTP runtime, request logs, rate-limit-aware retries, and dashboard health views. Consider background jobs for bulk writes. |
| High-volume sync / many tenants | Add queue workers, sync checkpoints, record cache/change tables, provider quota management, and possibly split workers from web/API runtime. |
| Enterprise/security-sensitive | Add organization/user/RBAC model, audit events, key rotation, secret KMS, environment separation, and provider-level compliance controls. |

### What Breaks First

1. **Provider branch drift in routes** — fix with adapter-only route dispatch and capability registry.
2. **Docs/runtime mismatch** — fix with schema/capability-backed OpenAPI tests or generation.
3. **Secrets and dashboard access** — fix before making dashboard operational.
4. **Upstream instability** — fix with shared provider HTTP client before adding many providers.
5. **Bulk/sync volume** — fix later with queues/checkpoints once the connector contract is stable.

## Anti-Patterns

### Anti-Pattern 1: Provider Switches in Public Routes

**What people do:** Add `if provider === 'X'` branches in each route.  
**Why it's wrong:** Every provider addition requires route edits and makes the unified API a facade over special cases.  
**Do this instead:** Route → capability gate → adapter method. Provider differences live inside provider modules.

### Anti-Pattern 2: Lowest-Common-Denominator Canonical Model

**What people do:** Remove every field that is not available in every provider.  
**Why it's wrong:** The API becomes too weak for real business workflows.  
**Do this instead:** Keep a stable core model plus explicit optional fields, `customFields`, provider extensions, and controlled raw/passthrough access.

### Anti-Pattern 3: Raw Provider Payloads by Default

**What people do:** Always include full upstream payloads in `remoteData.raw`.  
**Why it's wrong:** It leaks PII/provider internals, bloats responses, and creates accidental consumer dependencies on unstable data.  
**Do this instead:** Hide raw data by default; expose redacted remote data only via explicit debug/admin option.

### Anti-Pattern 4: Generated Stub Equals Supported Connector

**What people do:** Generate provider classes that return empty lists or generic “not implemented” errors but can be registered.  
**Why it's wrong:** Consumers see false support and runtime 500s.  
**Do this instead:** Generated providers should declare capabilities as unsupported until implemented, and conformance tests should fail for any advertised operation without implementation.

### Anti-Pattern 5: Docs as a Separate Manual Artifact

**What people do:** Hand-update OpenAPI separately from routes/providers.  
**Why it's wrong:** External developers build against behavior that may not exist.  
**Do this instead:** Derive or test docs against route schemas and provider capabilities.

## Integration Points

### External Services

| Service Type | Integration Pattern | Notes |
|--------------|---------------------|-------|
| OAuth business apps | Signed connect session/state → callback → encrypted credentials → adapter calls | Must bind state to admin/session/client/account and prevent replay. |
| API-key/basic-auth providers | Dashboard connection form → encrypted credentials → validation call | Treat credentials like OAuth tokens; never display after creation. |
| Provider REST/JSON-RPC APIs | Provider HTTP client with typed adapter methods | Omie-style JSON-RPC and Conta Azul-style REST can share runtime behavior but not endpoint builders. |
| Provider webhooks | Verify signature → attribute connection → enqueue processing | Defer broad webhook platform until connection/capability model exists. |
| OpenAPI/docs consumers | Capability-aware docs + stable error schema | Public docs are part of the contract, not marketing copy. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Route ↔ Contract schemas | Direct imports | Routes parse and serialize only canonical DTOs. |
| Route ↔ Provider registry | Direct imports | Registry returns provider module and capability metadata. |
| Adapter ↔ Provider HTTP client | Function calls | Adapter supplies endpoint/payload; runtime supplies auth/retry/error behavior. |
| Mapper ↔ Contract model | Pure function + Zod parse | No database or network side effects in mappers. |
| Dashboard ↔ Connection store | Server actions with authz | Never expose raw secrets; write audit events. |
| OpenAPI ↔ Capabilities/schemas | Generated or tested references | Prevent drift from runtime behavior. |

## Sources

- Merge docs, “How Merge works” — Linked Accounts, account tokens, Unified API, Common Models, token exchange, dashboard: https://docs.merge.dev/merge-unified/concepts.md (HIGH)
- Merge docs, “Architecture reference” — recommended path: link, webhooks, sync, writes, supplemental data, production keys: https://docs.merge.dev/merge-unified/architecture-reference.md (HIGH)
- Merge docs, “Supplemental Data” and “Remote Data” — raw/supplemental data, passthrough, field mapping, remote data caveats: https://docs.merge.dev/merge-unified/supplemental-data/overview.md and https://docs.merge.dev/merge-unified/supplemental-data/remote-data.md (HIGH)
- Nango docs, “Unified APIs with functions” — code-first unification, stable model plus provider extensions, validate at integration boundary: https://nango.dev/docs/guides/functions/unified-apis.md (HIGH)
- Nango docs introduction — Auth, Functions, retries, rate limits, observability, environments, tenant isolation as platform concerns: https://nango.dev/docs/getting-started/intro-to-nango.md (HIGH)
- Apideck docs, “Vault API” — consumers, connections, sessions, token handling, custom mappings, logs: https://developers.apideck.com/apis/vault/reference.md (HIGH)
- Apideck docs, “Custom Field mapping” — unified model, mapping downstream responses to common properties, custom fields/mappings: https://developers.apideck.com/guides/field-mapping.md (HIGH)
- Apideck docs, “Unified Rate Limits” — standardized downstream rate-limit headers and retry/backoff implications: https://developers.apideck.com/guides/unified-rate-limits.md (HIGH)
- Local codebase maps: `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONCERNS.md` (HIGH for current brownfield fit)

---
*Architecture research for: Open iPaaS unified API/iPaaS platform*  
*Researched: 2026-05-24*
