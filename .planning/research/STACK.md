# Stack Research

**Domain:** unified API / iPaaS platform for business-app connectors  
**Researched:** 2026-05-24  
**Confidence:** MEDIUM-HIGH

## Executive Recommendation

Keep the existing Next.js 16 + TypeScript monolith as the public API, dashboard, docs, and connector-control-plane for v1. Do **not** rewrite into microservices yet. The standard 2026 implementation approach for an extensible unified API/iPaaS is a modular monolith with a strict connector SDK boundary, generated OpenAPI from runtime schemas, encrypted tenant credentials, provider capability metadata, shared outbound HTTP policy, background jobs for bulk/sync work, and first-class observability.

The stack should evolve from “routes call adapters” to “contract + capability registry + connector runtime.” Next.js route handlers should remain thin: authenticate, validate request/query, check provider capabilities, enqueue or call the connector runtime, normalize errors, and return a stable unified shape. Provider-specific code should live only in connector modules.

## Recommended Stack

### Core Technologies

| Technology | Version Guidance | Purpose | Why Recommended | Confidence |
|------------|------------------|---------|-----------------|------------|
| Next.js | Existing 16.2.4; keep pinned until phase-specific docs review | Public API routes, dashboard, docs, server actions | Already installed and mapped. For v1, the platform needs stronger integration boundaries, not a framework rewrite. Keep App Router but add route tests around framework-sensitive handlers. | HIGH |
| TypeScript | 5.x existing | Connector SDK, typed canonical contracts, provider DTOs | Type safety is the main defense against connector sprawl. Replace `any` at the provider boundary with typed credentials, query DTOs, payloads, and `unknown` raw payloads. | HIGH |
| PostgreSQL | Existing 15 local; production managed Postgres recommended | System of record for tenants, API keys, linked accounts, credentials, capabilities, audit events, connector runs | iPaaS control-plane data is relational and audit-heavy. Keep Postgres as the source of truth; add schema for organizations, users, encrypted credentials, capability registry, provider runs, logs, and idempotency keys. | HIGH |
| Prisma ORM | Upgrade path to 7.8.0 current; plan dedicated migration from existing 5.22.0 | Type-safe DB access and migrations | Current project uses Prisma 5.22.0 while npm current is 7.8.0. Upgrade deliberately after auth/credential tests exist. Prisma docs confirm modern Postgres driver adapter/connection-pooling patterns. | HIGH |
| Zod | Existing 4.4.2; current 4.4.3 | Runtime schemas for public request/response contracts and connector inputs | Keep Zod as the canonical contract layer. Every unified route should parse headers/query/body before provider calls and parse/strip provider output before response. | HIGH |
| `zod-openapi` | 5.4.6 current | Generate OpenAPI 3.1 from Zod schemas | Prefer over hand-written `src/lib/openapi.ts` to stop docs drift. Docs show OpenAPI 3.1 generation from Zod `.meta()` schemas and operation objects. | HIGH |
| Scalar API Reference | Existing 0.9.32; current `@scalar/api-reference-react` 0.9.41 | Interactive API docs UI | Keep Scalar as renderer. Change the source from hand-written object to generated OpenAPI. | HIGH |
| Docker + separate worker process | Existing app Docker; add worker image/process | Deploy API/dashboard separately from queue workers | iPaaS workloads include syncs, retries, bulk deletes, webhooks, and token refresh; these should not all run inside request/response route handlers. | HIGH |

### Connector Runtime & Integration Libraries

| Library / Component | Version Guidance | Purpose | When to Use | Confidence |
|---------------------|------------------|---------|-------------|------------|
| Native `fetch` + shared provider HTTP client | Node 20+ global fetch; no extra dependency required | Central outbound client with timeout, retry/backoff, redaction, provider error mapping, correlation IDs | Use for all upstream REST/JSON-RPC calls. Wrap `fetch` once; ban direct provider `fetch` calls outside connector runtime. | HIGH |
| `bottleneck` | 2.19.5 current | Per-provider/per-account rate limiting and concurrency control for synchronous calls | Use immediately for route-time provider calls and OAuth/token refresh to avoid provider throttling and refresh storms. | MEDIUM-HIGH |
| BullMQ | 5.77.2 current | Redis-backed background jobs for bulk operations, scheduled syncs, retries, and webhook processing | Use for v1 async work. Official docs describe Redis-backed jobs, retries, concurrency, delayed jobs, and global rate limiting. | HIGH |
| Redis / Valkey | Current managed Redis or Valkey | Queue backend, short-lived auth/cache/rate-limit state, distributed locks | Add once BullMQ is introduced. Do not use Postgres as a general job queue for provider sync workloads. | HIGH |
| Temporal TypeScript SDK | `@temporalio/*` 1.16.2 current | Durable workflows for long-running multi-step sync/orchestration | Defer for v1 unless you need cross-day sync workflows, human approval, sagas, or resumable multi-system orchestration. Temporal docs are strong, but it adds operational complexity. | MEDIUM |
| `svix` | 1.94.0 current | Outgoing webhooks to customers | Use when the platform emits events to customers. Official docs emphasize retries, endpoint management, idempotency, throttling, and webhook delivery DX. Build in-house only if webhook delivery is not a product feature. | MEDIUM-HIGH |
| `jose` | 6.2.3 current | Signed OAuth state/JWT-like tokens if needed | Use for signed, expiring OAuth state or admin/session tokens where Better Auth does not own the flow. | HIGH |
| Node `crypto` AES-GCM or KMS envelope encryption | Built-in + cloud KMS where hosted | Encrypt provider credentials/tokens at application layer | Required before production connectors. Store ciphertext + key version; never display refresh tokens or provider secrets. | HIGH |

### Authentication, Authorization & API Key Management

| Component | Version Guidance | Purpose | Why Recommended | Confidence |
|-----------|------------------|---------|-----------------|------------|
| Better Auth | 1.6.11 current | Dashboard/admin authentication, orgs/RBAC, sessions | Official docs describe framework-agnostic TypeScript auth with organizations/access control plugins. Prefer this over unblocking the dashboard with custom auth. Validate Next.js 16 integration in a spike. | MEDIUM |
| Custom API key lifecycle using Argon2 + prefix lookup | `argon2` 0.44.0 current | Public unified API keys | Keep public API-key auth custom because it is product-specific: prefix for lookup, hash for verification, one-time display, rotation, revocation, expiry, scopes, audit logs. | HIGH |
| Optional Unkey | `@unkey/api` 2.3.4 current; `unkey` package 2.0.107-rc.3 | Managed API key service | Consider only if outsourcing key management is acceptable. For an open iPaaS/control-plane product, own the key lifecycle first to preserve tenant/account-token semantics. | MEDIUM |

### Observability, Reliability & Security

| Library / Platform | Version Guidance | Purpose | Why Recommended | Confidence |
|--------------------|------------------|---------|-----------------|------------|
| Pino | 10.3.1 current | Structured JSON logs | Replace scattered `console.*`. Include request ID, tenant/client ID, linked account ID, provider, operation, upstream status, duration, redacted error code. | HIGH |
| OpenTelemetry JS | `@opentelemetry/api` 1.9.1; `@opentelemetry/sdk-node` 0.218.0 current | Vendor-neutral traces/metrics/log correlation | Official docs show NodeSDK, OTLP exporters, and auto-instrumentations. Use for provider call spans, queue jobs, DB spans, and connector latency/error metrics. | HIGH |
| Sentry Next.js SDK | 10.53.1 current | Error monitoring, traces, logs, source maps | Official Next.js docs provide wizard/manual setup, server/client/edge config, request error capture, logs, and tracing. Use Sentry for actionable production error triage; keep OTel for portable telemetry. | HIGH |
| Idempotency key table | App-level schema | Safe retries for mutations/bulk operations | Critical for unified APIs where provider retries may create duplicate customers/orders. Add per-client/account/operation idempotency records. | HIGH |
| Audit event table | App-level schema | Security and support trail | Required for API key creation/rotation, linked-account changes, token refresh failures, bulk deletes, admin actions, and provider credential access. | HIGH |

### Testing & Contract Tooling

| Tool | Version Guidance | Purpose | Configuration Notes | Confidence |
|------|------------------|---------|---------------------|------------|
| Vitest | Existing 4.1.5 | Unit and route-handler tests | Keep. Add tests for auth wrapper, capability errors, request validation, token refresh, provider HTTP client, and generated OpenAPI parity. | HIGH |
| MSW or Undici MockAgent | Check package during implementation | Mock upstream provider HTTP APIs | Use provider fixture tests instead of live ERP calls. Prefer MockAgent if staying close to native fetch/undici. | MEDIUM |
| OpenAPI diff/check in CI | Tool choice phase-specific | Prevent breaking public API changes | Add a generated spec artifact and compare against previous v1 spec before release. | MEDIUM |
| Contract fixture packs per provider | App-owned test data | Connector regression testing | Every connector should ship success/error/rate-limit/pagination/token-expiry fixtures and conformance tests against the provider interface. | HIGH |

## Implementation Approach for the Existing Stack

1. **Stabilize the contract layer first.** Move public request/response schemas into Zod modules with `.meta()` docs and generate OpenAPI with `zod-openapi`; Scalar continues rendering docs.
2. **Create a connector SDK boundary.** Replace `IUnifiedProvider` plus hardcoded switch with a provider registry containing: provider key, auth type, credential schema, supported capabilities, operations, rate-limit policy, mapper set, and test fixtures.
3. **Centralize outbound calls.** Add `providerHttpClient` wrapping native `fetch` with `AbortSignal.timeout`, retry/backoff for safe methods, 429 handling, redacted errors, OTel spans, Pino logs, and provider-specific error translation.
4. **Make capabilities runtime-visible.** Unsupported resources should return deterministic `501`/capability errors before calling providers. OpenAPI should expose global v1 routes plus per-provider capability metadata endpoints.
5. **Harden credential and key storage.** Hash API keys, encrypt provider tokens/secrets, sign one-time OAuth state, stop rendering secrets, and audit every sensitive action.
6. **Add async execution only where it buys reliability.** Keep low-latency reads synchronous through the provider client. Move bulk deletes, large syncs, webhook ingestion, scheduled token refresh checks, and retries to BullMQ workers.
7. **Instrument before expanding providers.** Add logs/traces/metrics around every provider call and job. Connector additions without observability will be impossible to support.

## Installation Guidance

Run only after the relevant implementation phase has tests and migration plan.

```bash
# Contract/docs generation
npm install zod-openapi

# Background jobs and rate limits
npm install bullmq ioredis bottleneck

# Admin auth and API key hashing
npm install better-auth argon2 jose

# Observability
npm install pino @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @sentry/nextjs

# Optional outgoing customer webhooks
npm install svix

# Dedicated Prisma upgrade phase, not mixed with connector work
npm install prisma@latest @prisma/client@latest
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Modular Next.js monolith + worker | Immediate microservices split | Only after provider volume or team boundaries require independently deployable connector services. Premature split will slow v1 and duplicate auth/contract logic. |
| BullMQ for v1 async jobs | Temporal from day one | Use Temporal if workflows are multi-day, need durable signals/timers/sagas, or cross-system compensation. BullMQ is enough for queue/retry/rate-limit/bulk jobs. |
| Zod + `zod-openapi` | Hand-written OpenAPI object | Hand-writing is acceptable for prototypes only; this project already has docs drift risk. |
| Custom API key lifecycle | Outsourced key platform (Unkey) | Use outsourced keys if product scope excludes auth control-plane. Here, keys are tied to linked accounts, scopes, audits, and tenant semantics, so custom is safer initially. |
| Better Auth for dashboard | Auth.js/NextAuth or custom sessions | Auth.js is viable; Better Auth is more directly aligned with TypeScript, org/RBAC, and plugin-heavy admin needs. Validate with Next.js 16 before committing. |
| Native fetch wrapper | Axios everywhere | Avoid adding Axios unless provider APIs need features not covered by fetch. Native fetch reduces dependency surface and works with OTel/Node runtime patterns. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Direct `fetch` inside every provider | No uniform timeout, retry, redaction, metrics, or rate-limit behavior | Shared provider HTTP client + provider policy registry |
| Provider-specific branching in route handlers | Breaks extensibility and causes route-by-route rewrites | Capability-checked provider operations behind connector registry |
| Production stubs returning empty arrays | Makes unsupported connectors look successful | Explicit `501` unsupported capability errors and failing conformance tests |
| Plaintext API keys/tokens | Database/dashboard compromise exposes customer systems | Argon2-hashed API keys; encrypted OAuth/provider credentials; one-time secret display |
| Raw provider payloads by default | Leaks PII/internal provider fields and bloats responses | Redacted `remoteData` only behind explicit debug/admin mode |
| Postgres-only job queue for provider sync | Hard to scale rate limits, retries, delayed jobs, and workers cleanly | BullMQ + Redis/Valkey for operational jobs |
| No-code connector builder as v1 foundation | Provider APIs differ too much; hides real auth/mapping/error complexity | Hybrid scaffold generator + explicit connector implementation + conformance tests |

## Version Compatibility / Upgrade Notes

| Area | Current | Recommendation | Notes |
|------|---------|----------------|-------|
| Prisma | 5.22.0 | Plan upgrade to 7.8.0 after tests | Prisma docs show modern driver adapter and pooling patterns; do not mix upgrade with auth/connector refactor. |
| Zod | 4.4.2 | Patch to 4.4.3 when convenient | `zod-openapi` supports Zod 4 metadata patterns. |
| Scalar | 0.9.32 | Patch to 0.9.41 when docs generation changes | Low-risk renderer patch; verify docs page after upgrade. |
| Next.js | 16.2.4 | Keep pinned | Project instructions require reading installed Next docs before code changes. |
| Node | 20 | Keep for now; consider Node 22 LTS later | Current Dockerfile and types target Node 20. Avoid runtime upgrade during connector architecture work. |

## Roadmap Implications

Suggested stack-related phase order:

1. **Contract and OpenAPI generation** — Zod schemas + `zod-openapi` + Scalar, so public behavior is defined before adding providers.
2. **Connector registry and capability metadata** — provider SDK boundary, generated registration, unsupported capability responses.
3. **Security foundation** — Better Auth spike, API key hashing, credential encryption, signed OAuth state, audit events.
4. **Provider HTTP reliability** — shared fetch wrapper, timeout/retry/rate-limit/error normalization, logs/traces.
5. **Async jobs** — Redis/Valkey + BullMQ workers for bulk/sync/webhook/token tasks.
6. **Provider expansion** — add CRMs/commerce/finance/logistics only after the connector conformance harness exists.

## Sources

- Existing project docs: `.planning/PROJECT.md`, `.planning/codebase/STACK.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/CONCERNS.md` — current architecture and risks (HIGH).
- npm registry version checks on 2026-05-24 for Prisma, Zod, zod-openapi, Scalar, BullMQ, Bottleneck, Better Auth, Argon2, jose, Pino, OpenTelemetry, Sentry, Svix, Temporal (MEDIUM-HIGH).
- Context7 `/prisma/web` — Prisma ORM/Postgres driver adapter and connection pooling docs (HIGH).
- Context7 `/taskforcesh/bullmq` and https://docs.bullmq.io/ — Redis-backed queues, retries, concurrency, delayed jobs, global/manual rate limiting (HIGH).
- Context7 `/samchungy/zod-openapi` — OpenAPI 3.1 generation from Zod schemas and `.meta()` metadata (HIGH).
- Context7 `/open-telemetry/opentelemetry-js` — NodeSDK, OTLP exporters, auto-instrumentation, graceful shutdown (HIGH).
- https://www.better-auth.com/docs/introduction — framework-agnostic TypeScript auth, organizations/access control, plugins (MEDIUM; validate Next.js 16 integration).
- https://docs.sentry.io/platforms/javascript/guides/nextjs/ — Sentry Next.js setup, server/client/edge instrumentation, request error capture, logs/tracing (HIGH).
- https://docs.temporal.io/develop/typescript — Temporal TypeScript workflows, activities, workers, schedules, testing (MEDIUM-HIGH).
- https://docs.svix.com/ — webhook delivery, retries, idempotency, throttling, endpoint management (MEDIUM-HIGH).

---
*Stack research for: unified API/iPaaS connector platform*  
*Researched: 2026-05-24*
