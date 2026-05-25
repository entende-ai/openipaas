# Pitfalls Research

**Domain:** Unified API / iPaaS connector platform for business apps  
**Researched:** 2026-05-24  
**Confidence:** HIGH for security/resilience/API-contract pitfalls from official sources and codebase audit; MEDIUM for domain-specific expansion sequencing based on ecosystem patterns plus current brownfield concerns.

## Critical Pitfalls

### Pitfall 1: Treating a unified API as route glue instead of a connector contract

**What goes wrong:**
Unified routes keep adding provider-specific `if/switch` branches until every new app requires touching public route handlers, mappers, OpenAPI docs, tests, and dashboard code. The API stops being “integrate once” and becomes a set of provider-shaped exceptions hidden behind similar URLs.

**Why it happens:**
The first two or three integrations look similar enough that direct route branching feels faster than formalizing provider capabilities, typed operations, unsupported-method semantics, and connector registration. This project already shows this risk: several unified routes still call Conta Azul-style helpers directly or switch on `linkedAccount.provider` outside the factory.

**How to avoid:**
- Move every provider-specific operation behind `IUnifiedProvider` or a successor connector contract.
- Add provider capability metadata for each resource/action: `customers.read`, `products.create`, `sales.pdf`, `bulk.delete`, etc.
- Make unsupported capabilities deterministic before the provider call: return documented `501 Not Implemented`, `404 capability_not_supported`, or equivalent stable public error.
- Replace manual `ProviderFactory` wiring with a provider registry generated or validated by tests.
- Require each connector PR to include implementation, capability declaration, mapper fixtures, route contract tests, and OpenAPI capability exposure.

**Warning signs:**
- New provider work modifies files under `src/app/api/unified/v1/**` instead of only provider/mapper/registry files.
- `ProviderFactory` grows as a hand-maintained switch with no test proving every generated provider is registered.
- Stubs return empty lists in production paths.
- “This provider does not support X” appears as a generic thrown `Error` or 500.

**Phase to address:**
Phase 1 — Provider Contract & Capability Registry. Do this before adding more business apps.

---

### Pitfall 2: Letting generated connector stubs look production-ready

**What goes wrong:**
A generated provider compiles, has a smoke test, and returns empty arrays or generic “not implemented” errors. It can be registered or partially exposed in docs and dashboards before it actually supports the promised operations, causing silent data loss, false demos, and customer confusion.

**Why it happens:**
Scaffolding optimizes for developer speed but not for runtime safety. In connector platforms, “empty response” is ambiguous: it can mean no records, invalid credentials, unsupported resource, rate limit, upstream outage, or unimplemented provider.

**How to avoid:**
- Generate fail-closed providers: every unsupported method must return a typed `CapabilityNotSupported`/`NotImplemented` error, never an empty successful list.
- Generate a failing registration/capability test until the provider is explicitly registered and marked experimental or production.
- Add provider maturity states: `scaffolded`, `experimental`, `beta`, `production`, and gate dashboard/docs exposure by state.
- Require fixture-backed mapper tests for any capability marked supported.
- Add a CI check that no provider method contains placeholder success returns.

**Warning signs:**
- Generated tests only instantiate the provider.
- Unsupported provider actions return `[]`, `null`, or 200 with placeholder data.
- Provider appears in UI or OpenAPI before capability tests exist.
- “TODO implement” exists in provider implementation files.

**Phase to address:**
Phase 1 — Provider Contract & Capability Registry, then Phase 6 — Connector Expansion Playbook.

---

### Pitfall 3: Designing one canonical schema that either hides too much or leaks too much

**What goes wrong:**
The unified model becomes either too strict to represent real providers or too loose to be useful. Teams then add `any`, provider-specific fields, and `remoteData.raw` everywhere. Consumers start depending on raw upstream payloads, making future normalization, redaction, and provider replacement impossible.

**Why it happens:**
ERP, CRM, commerce, finance, logistics, and catalog systems share nouns but not semantics. “Customer,” “product,” “order,” “invoice,” “seller,” and “status” differ across providers. Early projects often normalize field names but skip explicit decisions about required fields, nullable fields, provider metadata, enum mapping, raw payload policy, and versioning.

**How to avoid:**
- Define canonical contracts per domain, not globally: customers, products/catalog, sales/orders, finance each need their own normalization rules.
- Keep normalized fields strict and documented; keep provider-specific extensions under a typed `providerMetadata` object with redaction rules.
- Hide `remoteData.raw` by default. If needed, expose raw payloads only through authenticated admin/debug paths with explicit redaction and size limits.
- Use `unknown` at raw boundaries, provider payload interfaces, and Zod parsing at ingress/egress; do not allow `any` in provider contracts.
- Version public contract changes and add compatibility tests using fixtures from every supported provider.

**Warning signs:**
- Public response examples include full upstream objects.
- Consumers need provider-specific documentation to understand common fields.
- Mappers pass Zod only after runtime provider calls, while request/query schemas are missing.
- New fields are added directly to unified types because one provider needs them.

**Phase to address:**
Phase 2 — Canonical Resource Contracts & Validation.

---

### Pitfall 4: OpenAPI drift from runtime capabilities

**What goes wrong:**
The documentation says an operation exists, but runtime returns 501, provider raw payloads, different status codes, different paths, or different request schemas. External developers lose trust because generated clients and docs become unreliable.

**Why it happens:**
OpenAPI is hand-maintained separately from route handlers, provider capabilities, and validation schemas. This project already has documented examples: `/sales/bulk-delete` vs implemented `/sales/bulk`, documented create/update/delete operations not consistently implemented, and response shapes that can differ by provider.

**How to avoid:**
- Make OpenAPI generated from shared route metadata, Zod schemas, and provider capability metadata, or add contract tests that compare docs with actual route exports.
- Treat the OpenAPI spec as a build artifact with CI diff review.
- Add per-provider capability sections or documented behavior for unsupported operations.
- Add tests for path/method/status consistency and schema conformance for representative routes.

**Warning signs:**
- Docs are edited in `src/lib/openapi.ts` without route tests.
- Public docs list operations before any provider supports them.
- Route names, handler names, and OpenAPI paths disagree.
- API clients report 404/501 for documented operations.

**Phase to address:**
Phase 3 — API Contract, OpenAPI, and Developer Trust.

---

### Pitfall 5: Forwarding invalid requests to providers and exposing provider-shaped errors

**What goes wrong:**
Bad IDs, oversized bulk requests, invalid query params, unsupported content types, and malformed bodies are sent upstream. The public API returns provider-specific validation errors, raw messages, or inconsistent status codes. Consumers cannot write reliable error handling and sensitive upstream details may leak.

**Why it happens:**
Validation is often added to mapper outputs but skipped at the API edge. Direct helper calls feel simpler than centralized input parsing and error mapping. OWASP REST guidance explicitly recommends validating input, constraining size/type/format, validating content types, and returning generic errors without technical internals.

**How to avoid:**
- Add Zod request/query/path schemas for every public route before provider calls.
- Add request size and bulk array limits.
- Enforce content type and accepted response type where relevant.
- Create a public error taxonomy: `invalid_request`, `auth_failed`, `account_not_found`, `capability_not_supported`, `provider_unavailable`, `rate_limited`, `provider_validation_failed`, etc.
- Log raw provider details server-side only, with redaction and correlation IDs.

**Warning signs:**
- Routes call `await req.json()` then pass objects directly to providers.
- Public JSON contains upstream response body, stack trace, provider endpoint, or provider field names not in the canonical contract.
- Similar validation failures return 400 in one route, 500 in another, and provider-specific 200-with-error in a third.

**Phase to address:**
Phase 2 — Canonical Resource Contracts & Validation, with Phase 3 public error docs.

---

### Pitfall 6: Treating secrets as ordinary database fields

**What goes wrong:**
API keys, account tokens, OAuth access tokens, refresh tokens, ERP client IDs/secrets, and provider credentials are stored and displayed in plaintext. A database leak, dashboard bug, log statement, or over-permissive admin action compromises every connected business system.

**Why it happens:**
Early iPaaS products optimize for making connections work. Credential lifecycle, encryption, one-time display, rotation, revocation, and audit trails are postponed until after real customer credentials exist. OWASP secrets guidance emphasizes centralization/standardization, least privilege, automation, rotation/revocation/expiration, and auditing.

**How to avoid:**
- Store API keys as prefix + keyed hash; show plaintext once on creation only.
- Encrypt OAuth/provider credentials at the application layer using deployment-managed keys; plan key rotation strategy.
- Add key lifecycle metadata: name, prefix, createdAt, lastUsedAt, expiresAt, revokedAt, rotatedFrom, scopes.
- Redact credentials from server actions, dashboard pages, logs, test tools, and error payloads.
- Add audit events for API key creation/revocation, account linking, token refresh, credential edits, and bulk destructive actions.

**Warning signs:**
- Dashboard renders full API keys or provider secrets.
- Prisma models store `accessToken`, `refreshToken`, or `clientSecret` as plain strings with no encryption wrapper.
- No revocation/rotation path exists.
- Logs include OAuth/token exchange response bodies.

**Phase to address:**
Phase 4 — Security Hardening: Credentials, OAuth, and Multi-Tenant Isolation. This is a blocker before production/customer credentials.

---

### Pitfall 7: Weak OAuth account-linking state and token refresh races

**What goes wrong:**
OAuth callbacks can link credentials to the wrong client/account, be replayed, or be forged through CSRF. Concurrent refreshes can overwrite newer refresh tokens with stale ones, breaking future requests.

**Why it happens:**
OAuth “state” is often treated as a convenient place to store `clientId`. RFC 6749 and OWASP OAuth guidance call out CSRF protection through `state`, binding to the user agent/session, redirect URI controls, and protection of refresh tokens. Refresh flows also look straightforward until multiple route handlers hit expired credentials simultaneously.

**How to avoid:**
- Replace `state=clientId` with a signed, random, one-time state record containing nonce, intended client/account, provider, redirect URI, expiry, and authenticated admin/session binding.
- Mark state as consumed transactionally on callback; reject expired/replayed/tampered state.
- Use a server-only canonical app URL for redirect URI construction and validate allowed origins.
- Add optimistic locking or compare-and-swap for token refresh updates; serialize refresh per credential if provider rotates refresh tokens.
- Test concurrent expired-token requests and OAuth callback failure cases.

**Warning signs:**
- OAuth state is readable business identifier only.
- Callback works without an authenticated admin/session context.
- Multiple refresh logs appear for the same credential at the same time.
- PDF/binary paths handle token expiry differently from JSON paths.

**Phase to address:**
Phase 4 — Security Hardening: Credentials, OAuth, and Multi-Tenant Isolation.

---

### Pitfall 8: Unblocking the dashboard before adding authorization boundaries

**What goes wrong:**
The dashboard becomes accessible and immediately exposes client creation, API key generation, linked-account creation, OAuth connect flows, test calls, and logs without an admin identity model or per-action authorization. This turns an internal operations UI into a credential management vulnerability.

**Why it happens:**
Dashboard code is present but currently blocked by middleware. The obvious fix is to remove the redirect. OWASP REST guidance warns that management endpoints should not be exposed without strong authentication and preferably should be isolated from public traffic.

**How to avoid:**
- Add admin authentication before changing the middleware from block-all to allow.
- Add authorization checks inside every server action, not only in middleware.
- Add organization/user/role/ownership models before multi-admin or self-service workflows.
- Add audit logging for every sensitive dashboard mutation.
- Paginate list pages and avoid loading/displaying secrets.

**Warning signs:**
- A PR removes dashboard redirect but does not add session/auth checks.
- Server actions mutate Prisma with no caller identity.
- Dashboard test tool can call unified APIs with arbitrary keys/account tokens visible in the browser.

**Phase to address:**
Phase 5 — Safe Operations Dashboard.

---

### Pitfall 9: Missing timeout, retry, backoff, rate-limit, and circuit-breaker policy per provider

**What goes wrong:**
Slow or degraded providers tie up route handlers, amplify outages, trigger duplicate mutations, and cause cascading failures. Bulk endpoints and high-volume integrations hit provider rate limits with inconsistent behavior. Users see random 500s instead of predictable `429`, `503`, or retryable errors.

**Why it happens:**
Early connectors call `fetch()` directly and retry only token expiration. Microsoft Azure architecture guidance recommends retrying transient faults with suitable delay, avoiding aggressive retries, considering idempotency, and using circuit breakers for long-lasting dependency failure. This project currently lacks shared upstream timeout/backoff/circuit-breaker behavior.

**How to avoid:**
- Build a shared provider HTTP client with per-provider timeouts, aborts, retry policy, rate-limit handling, correlation IDs, and structured provider errors.
- Retry only safe/idempotent operations by default; require idempotency keys or operation IDs for mutating retries.
- Use exponential backoff with jitter and honor upstream `Retry-After`/429/503 signals.
- Add provider-level circuit breakers and health/status telemetry.
- Move large bulk operations toward background jobs with provider quotas rather than synchronous route fan-out.

**Warning signs:**
- Provider code calls native `fetch()` directly.
- Retries happen around POST/DELETE without idempotency strategy.
- No `AbortController` timeout exists.
- Frequent provider 429/503 responses are logged as generic 500s.

**Phase to address:**
Phase 6 — Provider Resilience & Observability, before scaling provider count or bulk usage.

---

### Pitfall 10: Retrying mutating provider operations without idempotency

**What goes wrong:**
An ambiguous network failure after a provider mutation can cause duplicate sales, duplicate customers, repeated deletions, or inconsistent local/provider state. Retrying “because the connection failed” is unsafe unless the provider operation is idempotent or the platform supplies idempotency semantics.

**Why it happens:**
Distributed systems fail after work may already have happened. Stripe’s idempotency guidance describes the core ambiguity: a request can succeed server-side but fail before the client receives the response. Azure retry guidance similarly warns that non-idempotent retries can produce unintended side effects.

**How to avoid:**
- Require idempotency keys for public mutating unified endpoints.
- Store idempotency records scoped by client/account/provider/resource/action/body hash.
- Reuse cached successful response for duplicate idempotency keys; reject mismatched body hashes.
- For providers with native idempotency, pass through a provider-scoped key. For providers without it, protect local workflow and document remaining guarantees.
- Do not retry unsafe provider mutations unless idempotency is in place.

**Warning signs:**
- Bulk delete or POST handlers retry automatically.
- No idempotency table exists.
- Public docs do not describe retry safety for writes.
- Duplicate external records appear after timeout incidents.

**Phase to address:**
Phase 6 — Provider Resilience & Observability, and Phase 3 docs for public idempotency behavior.

---

### Pitfall 11: Weak tenant/account isolation in a two-token auth model

**What goes wrong:**
An API key from one client can be paired with another account token, dashboard actions can manage records outside their owner, or future caching/queues mix tenant state. One isolation bug in an iPaaS platform can expose external business data across customers.

**Why it happens:**
Current auth uses bearer API key plus `X-Account-Token`. That can work, but only if account tokens are always scoped to the authenticated client and every DB/cache/provider operation carries tenant context. OWASP multi-tenant guidance warns not to trust client-supplied tenant IDs without validation, to validate resource ownership, use tenant-scoped keys, rate limits, logs, and audit trails.

**How to avoid:**
- Derive tenant/client context from the verified API key, then validate account token ownership under that client on every request.
- Add composite lookup patterns and DB indexes around `(clientId, accountToken)` / ownership.
- Never use account tokens alone in dashboard/server actions.
- Include tenant/account context in logs, rate limits, idempotency records, caches, queues, and audit events.
- Add route tests for cross-client account-token misuse.

**Warning signs:**
- Queries look up `LinkedAccount` by account token alone.
- Logs or errors omit client/account context.
- Future cache keys do not include tenant/account prefix.
- Admin override flows are not explicit and audited.

**Phase to address:**
Phase 4 — Security Hardening: Credentials, OAuth, and Multi-Tenant Isolation.

---

### Pitfall 12: Expanding app categories before modeling capability differences

**What goes wrong:**
The platform expands from ERPs to CRMs, commerce, finance, logistics, and other apps but still assumes ERP-shaped resources and synchronous CRUD. The unified API accumulates edge cases: different pagination, identifiers, statuses, currencies/taxes, custom fields, webhooks, eventual consistency, and partial write support.

**Why it happens:**
“Business apps” share high-level concepts but not operational semantics. A customer in ERP, CRM, commerce, and finance systems may represent different lifecycle states and legal requirements. Expansion without capability/domain modeling creates brittle abstractions and constant breaking changes.

**How to avoid:**
- Add new app categories only after a capability matrix exists for the relevant domain.
- Separate domains where semantics differ: CRM contacts vs ERP customers vs commerce buyers may not belong in one v1 shape without clear mapping.
- Add provider-specific metadata only through typed extension points.
- Document consistency guarantees, pagination style, write support, and unsupported operations per provider.
- Pilot each new category with two providers before declaring a generalized domain stable.

**Warning signs:**
- One provider forces a major rename or enum change in a public type.
- “Customer” fields become mostly optional because providers disagree.
- Docs include many “only for provider X” notes in core schema fields.

**Phase to address:**
Phase 7 — New App Category Expansion, after contract/security/resilience foundations.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Provider-specific branching in public routes | Ships one connector quickly | Route layer becomes connector matrix; docs/tests drift | Never after Phase 1 |
| `any` across provider credentials/payloads | Avoids modeling unknown provider payloads | TypeScript cannot protect auth, validation, mapping, or docs | Only at raw boundary as `unknown`, never in contracts |
| Returning empty arrays from stubs | Demo looks successful | Silent false positives and data loss | Never in production paths |
| Hand-maintained OpenAPI object | Fast documentation edits | Docs diverge from runtime and capability support | MVP only with contract tests |
| Plaintext token columns | Simplest local development | DB/dashboard/log compromise becomes provider compromise | Local-only fixture data; not for real accounts |
| Direct `fetch()` in providers | Minimal dependencies | No consistent timeout/retry/rate/error behavior | Only inside shared provider HTTP client |
| Raw upstream payloads in public responses | Debugging convenience | Sensitive leakage and provider lock-in | Admin/debug-only with redaction |
| Blocking dashboard with middleware | Avoids auth decision | Dashboard cannot be used; removing block becomes dangerous | Temporary only until Phase 5 |

## Integration Gotchas

Common mistakes when connecting to external business systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OAuth providers | Using `state` as `clientId` | Signed one-time nonce bound to admin/session/client/provider with expiry and replay protection |
| OAuth token refresh | Concurrent refresh overwrites newer tokens | Compare-and-swap/locking per credential; concurrency tests |
| REST providers | Assuming all non-2xx errors are equivalent | Map provider-specific 400/401/403/404/409/429/5xx into stable public error taxonomy |
| JSON-RPC-ish providers | Treating HTTP 200 as success | Parse provider fault envelope before mapping response |
| Binary endpoints (PDF) | Skipping token refresh/error behavior used by JSON helpers | Run binary downloads through the same provider HTTP client and refresh policy |
| Bulk APIs | Synchronous large fan-out through route handler | Validate limits; use provider-native bulk or background jobs; track operation status |
| Pagination | Normalizing only records, not cursor/page semantics | Define unified pagination metadata and provider-specific adapter behavior |
| Rate-limited providers | Retrying immediately on 429 | Honor `Retry-After`, backoff with jitter, per-provider quotas/circuit breakers |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No upstream timeout | Hanging requests, exhausted route execution time | Shared HTTP client with `AbortController` and provider-specific timeouts | Any provider slowdown/outage |
| Aggressive retries | Provider throttling worsens; thundering herd | Exponential backoff with jitter; circuit breaker; retry budget | Provider incident or traffic spike |
| Non-idempotent write retry | Duplicate external mutations | Idempotency keys and persisted idempotency records | Any ambiguous network failure |
| Loading dashboard tables fully | Slow admin pages, accidental secret exposure | Pagination, column selection, secret redaction | Hundreds/thousands of clients/accounts |
| Embedding raw payloads | Large JSON responses and PII exposure | Default normalized response only; debug raw gated/redacted | Large records or list endpoints |
| One synchronous path for bulk operations | Timeouts and partial success ambiguity | Job queue/status resource; provider-native bulk semantics | Bulk deletes/imports beyond small batches |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Plaintext API/provider tokens | Full compromise of connected business systems | Hash API keys; encrypt provider credentials; rotate/revoke; one-time display |
| Weak OAuth state | Account-linking CSRF or wrong-client binding | Signed nonce, expiry, session/admin binding, one-time consumption |
| Raw provider errors/payloads | PII/secrets/internal provider details leak | Stable public errors; redacted server logs; no raw by default |
| Unauthenticated dashboard/server actions | Anyone with access can create clients, keys, linked accounts | Admin auth, per-action authorization, audit logs |
| Trusting account token independently | Cross-client account access | Validate account token ownership under authenticated API key |
| Missing audit logs | No incident response or credential accountability | Append-only audit events for sensitive actions |
| Public env vars for server OAuth config | Misrouted callbacks/config exposure | Server-only canonical app URL and validated redirect origins |
| Shared rate limits only | Noisy tenant/provider can degrade others | Per-tenant and per-provider quota/rate enforcement |

## UX Pitfalls

Common user/developer experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Docs promise unsupported operations | Developers build broken integrations | Capability-aware docs and deterministic unsupported responses |
| Provider errors leak through | Developers must learn every provider's error language | Stable public error codes with provider correlation IDs |
| “Connected” account does not mean capability-ready | Dashboard shows false success | Show connection health, credentials status, supported capabilities, last sync/test result |
| Raw payloads become the integration surface | Developers couple to a provider accidentally | Normalized schema plus typed provider metadata only |
| No idempotency docs | Developers fear retries or duplicate writes | Document retry/idempotency policy per mutating endpoint |
| Dashboard exposes full secrets | Operators copy/paste but compromise risk grows | One-time reveal, masked display, rotation/revocation controls |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **New provider scaffold:** Fails closed for unsupported methods; registered; has capability metadata; fixture-backed tests; not exposed as production by default.
- [ ] **Unified route:** Calls provider contract only; validates path/query/body before provider call; maps errors through public taxonomy; has route tests.
- [ ] **OpenAPI update:** Matches actual route path/method/status/schema; includes unsupported capability behavior; tested against runtime metadata.
- [ ] **OAuth connection:** Uses signed one-time state; validates redirect origin; stores encrypted tokens; handles refresh concurrency; has callback tests.
- [ ] **API key generation:** Stores only hash/prefix; displays once; supports revoke/rotate/expiry; writes audit event.
- [ ] **Dashboard unlock:** Has admin auth, server-action authorization, pagination, secret redaction, and audit logs.
- [ ] **Provider HTTP call:** Uses shared timeout/backoff/rate/error client; no direct `fetch()`; no raw error leakage.
- [ ] **Mutating endpoint:** Has idempotency-key behavior or explicitly documents no automatic retry; tests duplicate/replay cases.
- [ ] **Raw provider data:** Hidden by default; if exposed, gated to admin/debug with redaction and size limits.
- [ ] **Bulk operation:** Validates limits; documents partial success; preferably uses async job/status for large operations.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Provider branching spread through routes | HIGH | Freeze new providers; introduce contract/capabilities; migrate one domain at a time; add route tests before refactor |
| Stubs exposed in production | MEDIUM | Mark provider disabled/scaffolded; return deterministic 501; notify affected consumers; add generator guard tests |
| OpenAPI drift | MEDIUM | Inventory runtime routes vs spec; add contract tests; generate/diff docs from metadata; publish corrected docs/changelog |
| Plaintext secrets used with real accounts | HIGH | Add encryption/hash migration; rotate API/provider credentials; redact dashboard/logs; audit access during exposure window |
| OAuth state weakness shipped | HIGH | Disable/linking temporarily if needed; implement one-time signed state; review linked accounts for suspicious mismatches |
| Raw payload leakage | HIGH | Remove raw by default; add redaction; inspect logs/responses; notify if sensitive data exposed |
| Missing timeouts causing outages | MEDIUM | Wrap provider calls in shared client; set conservative timeouts; add circuit breaker and telemetry; test degraded providers |
| Duplicate mutations from retries | HIGH | Add idempotency records; reconcile external duplicates; document retry policy; disable unsafe retry paths |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Route glue instead of connector contract | Phase 1 — Provider Contract & Capability Registry | New provider requires no public route edits; contract tests pass for all capabilities |
| Production-looking stubs | Phase 1; Phase 6 — Connector Expansion Playbook | Generated provider unsupported methods return typed 501; CI fails on placeholder success returns |
| Bad canonical schema strategy | Phase 2 — Canonical Resource Contracts & Validation | Zod schemas cover request/response; no `any` in provider contracts; raw hidden by default |
| OpenAPI drift | Phase 3 — API Contract, OpenAPI, and Developer Trust | Spec-vs-runtime tests pass; route path/method/status/schema snapshots match |
| Provider-shaped validation/errors | Phase 2 and Phase 3 | Invalid inputs fail before provider call; public errors use stable taxonomy and correlation IDs |
| Plaintext secrets | Phase 4 — Security Hardening | API keys hashed; provider credentials encrypted; dashboard masks secrets; rotation/revocation tests pass |
| Weak OAuth/refresh races | Phase 4 | State replay/tamper/expiry tests pass; concurrent refresh test preserves latest tokens |
| Unsafe dashboard | Phase 5 — Safe Operations Dashboard | Middleware allows only authenticated admins; server actions reject unauthorized callers; audit events emitted |
| Missing provider resilience | Phase 6 — Provider Resilience & Observability | Shared HTTP client used by all providers; timeout/retry/circuit tests pass; telemetry includes provider/account correlation |
| Non-idempotent retries | Phase 6 plus Phase 3 docs | Mutating endpoints require/test idempotency keys or have no automatic retry; duplicate key returns cached result |
| Weak tenant/account isolation | Phase 4 | Cross-client account-token tests fail closed; DB lookups are ownership-scoped; logs/rate/idempotency include tenant/account |
| Premature app-category expansion | Phase 7 — New App Category Expansion | Capability matrix and two-provider pilot exist before marking a new domain stable |

## Recommended Roadmap Phase Order from Pitfalls

1. **Provider Contract & Capability Registry** — Stop architecture drift before adding connectors.
2. **Canonical Resource Contracts & Validation** — Stabilize public resource semantics and edge validation.
3. **API Contract, OpenAPI, and Developer Trust** — Make docs match runtime and define public errors/idempotency expectations.
4. **Security Hardening: Credentials, OAuth, and Multi-Tenant Isolation** — Protect real connected business systems before dashboard/provider expansion.
5. **Safe Operations Dashboard** — Unlock internal operations only after authz, secret masking, and audit exist.
6. **Provider Resilience & Observability** — Add shared timeouts/retries/backoff/circuit breakers/idempotency before higher traffic and bulk workflows.
7. **Connector Expansion Playbook** — Add new apps/categories through the proven scaffold/capability/test/docs pipeline.

## Sources

- Existing project context: `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md` — HIGH confidence for brownfield-specific risks.
- OWASP REST Security Cheat Sheet — input validation, management endpoints, generic errors, audit logs, API keys, status codes: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html — HIGH confidence.
- OWASP OAuth2 Cheat Sheet — state/PKCE/nonce guidance, token handling, refresh-token protection: https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html — HIGH confidence.
- RFC 6749 OAuth 2.0 Authorization Framework — OAuth roles, state, refresh tokens, client authentication, security considerations: https://www.rfc-editor.org/rfc/rfc6749 — HIGH confidence.
- OWASP Secrets Management Cheat Sheet — secret lifecycle, rotation, revocation, expiration, auditing, least privilege: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html — HIGH confidence.
- OWASP Multi-Tenant Application Security Cheat Sheet — tenant context, isolation, IDOR prevention, per-tenant rate limits/audit: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html — HIGH confidence.
- OpenAPI Specification v3.2.0 — OAS as machine/human-readable API contract and tooling basis: https://spec.openapis.org/oas/latest.html — HIGH confidence.
- Microsoft Azure Architecture Center, Retry Pattern — transient failures, backoff, idempotency concerns: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry — HIGH confidence.
- Microsoft Azure Architecture Center, Circuit Breaker Pattern — prevent cascading failures, monitor protected dependencies, handle 429/503: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker — HIGH confidence.
- Stripe engineering blog, “Designing robust and predictable APIs with idempotency” — ambiguous network failures, idempotency keys, exponential backoff/jitter: https://stripe.com/blog/idempotency — MEDIUM confidence as vendor engineering guidance, highly relevant to API/platform behavior.

---
*Pitfalls research for: unified API/iPaaS connector platform for business apps*  
*Researched: 2026-05-24*
