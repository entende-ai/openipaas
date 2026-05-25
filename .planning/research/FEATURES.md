# Feature Research

**Domain:** Developer-facing unified API / embedded iPaaS platform for business apps: ERPs, CRMs, commerce, finance, logistics, and adjacent SaaS apps  
**Researched:** 2026-05-24  
**Confidence:** HIGH for unified API/iPaaS feature patterns; MEDIUM for exact v1 ordering because customer segment and first vertical mix still need product validation.

## Feature Landscape

Unified API products converge on the same product promise: developers integrate once, end users connect many external accounts, and the platform absorbs provider-specific auth, data models, pagination, rate limits, errors, logs, and edge cases. Merge documents unified API categories, common models, account tokens, cursor pagination, `/meta` discovery for write requirements, incremental sync through `modified_after`, webhooks, passthrough, remote data, field mapping, custom objects, and scopes. Apideck exposes unified APIs plus Vault for consumers/connections/OAuth/token refresh/logs/custom mappings, Webhook APIs, Proxy APIs, Connector APIs, and an API Explorer. Nango positions auth, credential storage, retries, rate limits, logs, OpenTelemetry, tenant isolation, function runtime, syncs, webhooks, schedules, and code-owned integration logic as core integration infrastructure. Workato and Zapier represent the workflow-automation side: connectors, recipes/workflows, triggers/actions/searches, no-code/visual building, connector SDKs, lifecycle operations, and marketplace distribution.

For Open iPaaS v1, the winning path is not to copy the entire iPaaS category. The product already has unified routes, API-key/account-token auth, OpenAPI docs, dashboard foundations, Conta Azul implementation, partial Omie, and a Tiny stub. v1 should convert that foundation into a trustworthy developer API: stable canonical resources, connection lifecycle, provider capability discovery, docs that match runtime, predictable errors, secure credential handling, connector onboarding, logs, and enough operations dashboard to support real users.

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or unsafe for production.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Stable unified resource models for core domains | The core promise is “integrate once.” Developers expect customers, products/catalog, orders/sales, and finance objects to have predictable fields regardless of provider. | HIGH | v1 should lock canonical contracts for existing resources first, then add finance. Include provider IDs, timestamps, status enums, pagination metadata, and a controlled extension field. |
| Provider connection lifecycle | Unified API platforms expose a way to create, validate, revoke, and inspect linked accounts/connections. Apideck Vault and Merge Link make this explicit. | HIGH | Existing linked accounts/OAuth are a start. v1 needs authenticated dashboard/API flows, secure OAuth state, credential validation, disconnect/reconnect, and connection status. |
| Secure credential storage and API key lifecycle | Developers will not trust a broker of ERP/CRM credentials without key rotation, revocation, hashing/encryption, and least disclosure. | HIGH | Must precede broader dashboard access. Add hashed API keys, one-time reveal, key names, expiry/revocation, encrypted OAuth/provider secrets, and audit events. |
| Provider capability discovery | Users need to know which resources/methods each provider supports. Merge documents metadata patterns; Apideck exposes connector/resource schemas and examples. | MEDIUM | Add capability metadata per provider/resource/method. Use it to return deterministic `501`/capability errors and to drive docs/tests. |
| OpenAPI docs that match runtime behavior | Developer-facing API products live or die on accurate docs. Current OpenAPI drift is a known concern. | MEDIUM | Treat OpenAPI as a contract artifact generated from route + provider capability metadata or protected by contract tests. Include examples and auth headers. |
| Predictable error model | Provider errors, validation failures, auth failures, rate limits, and unsupported operations must have stable public codes. | MEDIUM | Add public error codes, sanitized messages, correlation/request IDs, retry hints, and raw provider detail only in internal logs. |
| Request/query/body validation before provider calls | Developers expect invalid input to fail consistently before hitting upstream systems. | MEDIUM | Add Zod schemas for all public route inputs, IDs, bulk arrays, filters, pagination, and write payloads. |
| Pagination and filtering semantics | List endpoints must not expose provider-specific pagination quirks. Merge explicitly recommends cursor pagination and incremental parameters. | MEDIUM | Choose one public pagination model. For v1, cursor-like `nextCursor` is preferable; adapt offset/page providers internally. |
| Incremental sync/read support | Business integrations need “what changed since X,” not repeated full re-fetches. Merge documents `modified_after`; Nango emphasizes syncs/checkpoints. | HIGH | Start with read-side `modifiedAfter`/date filters where providers support it and clearly mark unsupported cases. Full background sync can wait. |
| Logs and request observability | Nango and Apideck both expose logs because third-party API failures are inevitable. | MEDIUM | v1 needs per-request logs with provider, connection, route, status, latency, error code, redaction, and correlation ID. Dashboard can be internal-only initially. |
| Provider HTTP resilience | Integrations must handle upstream timeouts, 429s, token expiry, transient 5xx, and flaky APIs. | HIGH | Add shared HTTP client with timeout, bounded retries/backoff, rate-limit classification, token-refresh retry, and circuit-breaker/health hooks later. |
| Connector onboarding scaffold + contract tests | Adding providers quickly is part of the value proposition; current stubs can appear production-ready. | MEDIUM | Generator should create provider metadata, explicit unsupported methods, fixtures, mapper tests, registration, and docs/test failures until implemented. |
| Auth model for public API calls | Existing bearer API key + account token matches Merge-like patterns and is table stakes. | MEDIUM | Keep the model, but harden lookup/hash, ownership checks, expiration, rotation, and rate limits. |
| Operational dashboard for internal setup/support | Even developer-first products need a control plane for clients, keys, linked accounts, logs, and test calls. | MEDIUM | v1 can be internal/admin, not self-service tenant portal. Must include real admin auth before unblocking dashboard. |
| SDK/examples or copy-paste quickstart | Developers expect quickstarts, curl examples, and eventually SDKs. Apideck and Merge emphasize SDKs and quickstarts. | LOW-MEDIUM | For v1, high-quality curl/TypeScript examples and generated OpenAPI clients are enough; custom SDKs can wait. |
| Webhook endpoint subscription / event delivery foundation | Modern integration platforms support webhooks for connection events and data changes; Apideck and Merge document webhooks. | HIGH | For v1, prioritize internal connection/status events and outbound platform webhooks. Provider-native real-time sync for every provider is not required. |

### Differentiators (Competitive Advantage)

Features that set Open iPaaS apart. Not all are required for v1; choose differentiators that reinforce “developer trust + fast connector expansion.”

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Brazil/LatAm-first business app coverage | Merge/Apideck focus broad global SaaS categories; Open iPaaS can win by deeply supporting Conta Azul, Omie, Tiny, Bling, NFe/fiscal concepts, Brazilian catalog/tax fields, and local commerce/finance workflows. | HIGH | Strong v1 differentiator if canonical models preserve local reality without leaking every provider detail. |
| Capability-aware docs and runtime explorer | Developers can see exactly what a provider/account supports before calling it, avoiding “works for Conta Azul but 500s for Omie.” | MEDIUM | Build from provider metadata. Show supported methods, required fields, known limits, and sample responses per provider. |
| Hybrid canonical + controlled provider extensions | Strict normalized fields alone lose important provider-specific data; raw payloads by default leak/bloat. A controlled extension strategy is a competitive trust feature. | HIGH | Offer `providerMetadata`/`customFields`/explicit debug includes with redaction, not default `remoteData.raw`. |
| Connector quality score / readiness gates | Differentiate by making connector maturity explicit: auth-only, read-only, write-capable, beta, production, tests passing, docs coverage. | MEDIUM | Useful immediately because Omie is partial and Tiny is stubbed. Prevents accidental production stubs. |
| AI-assisted connector scaffold with human-owned code | Nango’s recent positioning validates code-owned integrations plus AI generation. Open iPaaS can offer provider scaffold + contract test generation without becoming no-code. | MEDIUM-HIGH | Future v1.x/v2 feature after the manual scaffold is safe. Keep generated code reviewable and tested. |
| Domain-specific reconciliation and idempotency helpers | Business systems need safe writes, duplicate prevention, and reconciliation between provider IDs and local IDs. | HIGH | Especially valuable for orders, invoices, payments, stock, and logistics. Requires storage, idempotency keys, and provider-specific matching. |
| Account-level configuration/mapping | Enterprise customers often need per-account field mapping, resource settings, scopes, and custom fields; Apideck Vault exposes settings, custom fields, and custom mappings. | HIGH | Defer advanced UI, but design schema now so canonical fields can map to provider/account-specific fields later. |
| Integration observability with provider-root-cause views | Instead of generic logs, explain failures by provider/auth/rate-limit/validation/capability categories. | MEDIUM | High leverage for support. Needs structured errors and log storage first. |
| Sandbox/test-provider mode | Developers need safe testing without touching production ERP data. Merge documents sandboxes; Zapier emphasizes testing and version promotion. | MEDIUM-HIGH | v1 can start with mock provider/fixtures and provider contract tests; full sandbox accounts are future. |
| Agent/tool-ready actions | Emerging differentiator: Merge Agent Handler and Nango tool-calling expose scoped external actions to AI agents. | HIGH | Future release. Do not distract v1 unless a customer explicitly needs AI agents. Requires stronger auth scopes, schemas, and audit. |
| Embedded connection UI | Drop-in connection flows reduce onboarding friction and mirror Merge Link/Apideck Vault patterns. | MEDIUM-HIGH | v1 can use internal dashboard/manual setup. Customer-facing embedded UI is v1.x after secure admin/tenant model. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this project now.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full no-code workflow builder in v1 | iPaaS products like Workato/Zapier have visual recipes/workflows. | Huge product surface; distracts from stable unified API, security, connectors, and docs. | Build developer-first API + internal ops dashboard. Add workflow automation only after API primitives and connectors are reliable. |
| Connector marketplace in v1 | Marketplaces signal breadth and platform maturity. | Marketplace without connector quality, security, docs, and support creates trust debt. | Maintain curated provider registry with readiness status and contract tests. |
| Real-time sync for every provider | Users like instant updates. | Many ERPs/apps lack reliable webhooks; forcing it creates polling complexity and false promises. | Support provider webhooks where available; otherwise incremental reads, scheduled sync later, and clear freshness metadata. |
| Raw upstream payloads returned by default | Developers ask for escape hatches when canonical fields are missing. | Can leak PII/secrets, bloat responses, and undermine unified contract. | Hide raw by default; expose redacted debug/raw fields behind explicit include flags and permissions. |
| Universal write support across all providers at launch | Write APIs are valuable for orders, invoices, customers, products. | Required fields, validations, side effects, idempotency, and provider limitations vary heavily; wrong writes damage customer systems. | Launch read-first plus carefully selected writes with `/meta`/capability metadata and idempotency. |
| Dynamic arbitrary provider proxy as primary API | Passthrough/proxy solves long-tail gaps. | If primary, it bypasses normalization, observability, security controls, and product differentiation. | Add audited passthrough later for advanced users; keep canonical API as default. |
| Public self-service admin portal before auth/RBAC/audit | It accelerates onboarding. | Current dashboard is blocked because actions lack auth; exposing it would be a serious security issue. | Keep internal-only until admin auth, RBAC/ownership, secret redaction, and audit logs exist. |
| Supporting every app category equally in v1 | Broad category coverage looks competitive. | Shallow coverage across ERPs/CRMs/commerce/finance/logistics will produce inconsistent contracts. | Pick 2-3 adjacent domains around existing routes: CRM-like customers, catalog/products, orders/sales, then finance. |
| Custom SDKs before API contract stabilizes | SDKs improve developer experience. | Premature SDKs multiply maintenance when OpenAPI and route behavior still drift. | Use OpenAPI + examples first; generate SDKs after contract tests pass. |
| AI agent features as v1 headline | Market is moving toward MCP/tool-calling. | Requires strong scopes, action schemas, auditability, and reliable writes; risky before core integration trust. | Design action schemas cleanly, but defer agent tooling to v2 unless customer-driven. |

## Feature Dependencies

```text
Secure credential storage + admin auth
    └──requires/enables──> Dashboard access for operations
                            └──enables──> Connection lifecycle management
                                           └──enables──> Embedded connection UI

Provider capability metadata
    ├──enables──> Capability-aware OpenAPI/docs
    ├──enables──> Deterministic unsupported-operation errors
    ├──enables──> Connector readiness score
    └──enables──> Safe provider expansion beyond Conta Azul

Canonical resource contracts
    ├──requires──> Request/response validation schemas
    ├──requires──> Provider mappers + fixtures
    ├──enables──> Stable OpenAPI quickstarts
    ├──enables──> Generated SDKs later
    └──enables──> Account-level field mapping later

Structured public error model
    ├──requires──> Provider HTTP resilience layer
    ├──requires──> Error redaction policy
    └──enables──> Observability dashboard and support workflows

Incremental reads / modified-after filters
    └──enables──> Scheduled syncs
                  └──enables──> Webhook reconciliation and data freshness SLAs

Idempotency + write metadata
    └──required before──> Broad write support for orders/invoices/payments

Logs + audit events
    ├──required before──> Production support
    ├──required before──> Public dashboard/self-service
    └──required before──> Agent/tool-ready actions

Connector scaffold + contract tests
    └──enables──> AI-assisted connector generation
```

### Dependency Notes

- **Dashboard access requires admin auth, RBAC/ownership, secret redaction, and audit logging:** The current dashboard actions are dangerous if simply unblocked.
- **Provider capability metadata should come before additional broad resource expansion:** Without it, partial providers create runtime surprises and OpenAPI drift.
- **Canonical contracts require validation and fixtures:** A TypeScript interface alone is not enough; route inputs, provider outputs, and docs need executable tests.
- **Observability depends on structured errors:** Logs are less useful if errors remain raw provider messages or generic 500s.
- **Writes require idempotency and metadata:** Provider-specific required fields and side effects make blind create/update/delete dangerous.
- **Webhooks and scheduled syncs depend on incremental read semantics:** If the platform cannot track changes safely, webhook delivery becomes noisy and hard to reconcile.

## MVP Definition

### Launch With (v1)

Minimum viable product — needed to validate the developer-facing unified API concept with real business app integrations.

- [ ] **Secure platform foundation** — hashed API keys, encrypted provider credentials, real dashboard/admin auth, safe OAuth state, key revoke/rotate, secret redaction.
- [ ] **Stable canonical contracts for existing core resources** — customers, products/catalog, orders/sales, sellers/reference catalog, plus a first finance read model if scope allows.
- [ ] **Provider capability registry** — resource/method support, provider status, unsupported-operation handling, readiness labels, and docs integration.
- [ ] **OpenAPI + examples aligned to runtime** — contract tests or metadata generation, accurate paths/methods, auth examples, pagination/error examples.
- [ ] **Predictable error and validation layer** — public error codes, Zod input validation, sanitized provider errors, deterministic 400/401/403/404/429/501/502 behavior.
- [ ] **Shared provider HTTP client** — timeouts, token-refresh retry, rate-limit classification, safe backoff, correlation IDs, and redacted logs.
- [ ] **Connector onboarding workflow** — scaffold generates provider implementation, metadata, fixtures, tests, explicit unsupported methods, and registration checks.
- [ ] **Internal operations dashboard** — clients, keys, linked accounts, connection status, logs, and route testing behind real admin auth.
- [ ] **Conta Azul production-grade connector + Omie honest partial support** — one high-quality connector beats several misleading stubs.

### Add After Validation (v1.x)

Features to add once the core is reliable with early users.

- [ ] **Additional Brazil/LatAm providers** — Tiny/Bling/other apps promoted only through readiness gates and contract tests.
- [ ] **Finance domain expansion** — invoices, payments, receivables/payables, accounts, taxes/fiscal fields; requires stricter write/read semantics.
- [ ] **Outbound platform webhooks** — connection status, sync completion, error notifications, selected data-change notifications.
- [ ] **Scheduled/incremental sync jobs** — background refresh with checkpoints, retry, and per-provider freshness metadata.
- [ ] **Account-level field mapping and custom fields** — controlled extensions for provider/customer-specific data.
- [ ] **Sandbox/mock provider mode** — fixture-backed test connections and sample apps for developers.
- [ ] **Generated SDKs from OpenAPI** — after route/docs contract stabilizes.
- [ ] **Embedded connection UI** — customer-facing connection flow once tenant/admin model is ready.

### Future Consideration (v2+)

Features to defer until product-market fit and operational maturity.

- [ ] **No-code workflow/recipe builder** — valuable only after canonical API, connectors, logs, and sync runtime are mature.
- [ ] **Public connector marketplace** — defer until connector quality scoring, docs, testing, and support process are proven.
- [ ] **Audited passthrough/proxy API** — useful escape hatch, but should not replace canonical APIs.
- [ ] **Advanced workflow automation and event orchestration** — queues, branching, transformations, retries, and human approvals.
- [ ] **AI agent/MCP tool surface** — expose scoped actions to agents after auth scopes, schemas, audit, and write safety exist.
- [ ] **Full self-service tenant portal** — requires org/user/RBAC model, billing, quotas, audit, support tooling, and security review.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Secure credential storage and API key lifecycle | HIGH | HIGH | P1 |
| Admin auth for dashboard/actions | HIGH | MEDIUM-HIGH | P1 |
| Stable canonical contracts for customers/products/sales | HIGH | HIGH | P1 |
| Provider capability discovery/metadata | HIGH | MEDIUM | P1 |
| Runtime-aligned OpenAPI docs | HIGH | MEDIUM | P1 |
| Predictable public error model | HIGH | MEDIUM | P1 |
| Request/query/body validation | HIGH | MEDIUM | P1 |
| Shared provider HTTP client resilience | HIGH | HIGH | P1 |
| Connector scaffold + contract tests | HIGH | MEDIUM | P1 |
| Internal logs/correlation IDs | HIGH | MEDIUM | P1 |
| Finance read models | MEDIUM-HIGH | HIGH | P2 |
| Incremental reads / modified-after semantics | HIGH | HIGH | P2 |
| Additional providers beyond Conta Azul/Omie | HIGH | HIGH | P2 |
| Account-level field mapping/custom fields | MEDIUM-HIGH | HIGH | P2 |
| Outbound webhooks | MEDIUM-HIGH | HIGH | P2 |
| Sandbox/mock provider | MEDIUM | MEDIUM | P2 |
| Embedded connection UI | MEDIUM-HIGH | MEDIUM-HIGH | P2 |
| Generated SDKs | MEDIUM | LOW-MEDIUM | P2/P3 |
| Scheduled sync runtime | HIGH | HIGH | P2/P3 |
| Passthrough/proxy API | MEDIUM | HIGH | P3 |
| No-code workflow builder | MEDIUM-HIGH | VERY HIGH | P3 |
| Connector marketplace | MEDIUM-HIGH | VERY HIGH | P3 |
| Agent/MCP tools | MEDIUM-HIGH | HIGH | P3 |

**Priority key:**
- P1: Must have for v1 launch / credible production use.
- P2: Should have soon after validation or when the first customers need it.
- P3: Future consideration; avoid pulling into v1 unless a signed customer requires it.

## Competitor Feature Analysis

| Feature | Merge | Apideck | Nango / Workato / Zapier | Open iPaaS Approach |
|---------|-------|---------|---------------------------|---------------------|
| Unified APIs by category | HRIS, ATS, CRM, Accounting, Ticketing, File Storage, Knowledge Base | Accounting, CRM, HRIS, File Storage, Ecommerce, POS, Issue Tracking, etc. | Nango can build unified APIs with functions; Workato/Zapier focus app automation/connectors. | Start narrower: customers, catalog/products, orders/sales, finance for Brazil/LatAm business apps. |
| Auth/account connections | API key + account token; Merge Link for connections | Vault consumers/connections/OAuth/token refresh | Nango Auth handles OAuth/API keys/token refresh/scopes; Zapier has app auth models. | Keep API key + account token; harden credentials and add secure connection lifecycle. |
| Capability/schema discovery | `/meta` for write required fields; integration metadata | Connection resource schema, examples, settings, custom fields/mappings | Nango functions use schemas; Zapier has triggers/actions/searches. | Make capability metadata a first-class v1 foundation. |
| Pagination/incremental reads | Cursor pagination and `modified_after` best practices | Unified API list endpoints and logs; docs vary by API | Nango sync checkpoints; Workato recipes/triggers. | Choose stable cursor/modified-after semantics and clearly mark provider support. |
| Webhooks/sync/events | Webhooks and sync frequency docs | Webhook subscription and event logs | Nango webhooks/sync/action completion; Workato event streams. | v1: connection/events foundation; v1.x: outbound webhooks and scheduled sync. |
| Supplemental/provider-specific data | Remote data, passthrough, field mapping, custom objects, scopes | Proxy, custom fields, custom mappings | Nango code-owned custom functions | Use controlled extensions and field mapping later; avoid raw-by-default. |
| Observability | Product docs include sync/rate concepts; dashboard implied | Vault logs and webhook event logs | Nango emphasizes comprehensive logs, filtering, OpenTelemetry | Build structured logs/correlation IDs early; OpenTelemetry later. |
| Developer tooling | SDKs, OpenAPI, Postman/sandbox docs | SDKs, API Explorer, CLI, samples | Nango CLI/dev/dryrun/tests; Zapier CLI/Visual Builder/testing/deployment | v1: OpenAPI, examples, contract tests, provider generator. SDKs after stabilization. |
| Automation/workflows | Not main product focus | Not main product focus | Workato/Zapier primary strengths | Explicitly not v1; developer unified API first. |
| AI/agent access | Agent Handler + MCP | MCP server beta | Nango tool calling/MCP; Workato agentic/MCP docs | Future differentiator, not v1 table stakes. |

## Roadmap Implications

Recommended requirements grouping for the next milestone:

1. **Trust and Security Foundation** — admin auth, API key lifecycle, encrypted credentials, OAuth state, audit events. This is prerequisite for unblocking dashboard and handling real customer secrets.
2. **Contract Stabilization** — canonical models, validation, provider capability metadata, public error model, OpenAPI/runtime contract tests. This is prerequisite for external developer adoption.
3. **Provider Runtime Hardening** — shared provider HTTP client, retries/timeouts/rate-limit handling, token refresh race mitigation, logs/correlation IDs.
4. **Connector Expansion System** — scaffold improvements, provider registry, readiness statuses, fixtures/contract tests, promote Omie/Tiny only when honest capabilities are implemented.
5. **Developer Experience and Operations** — internal dashboard, docs quickstart, examples, local/sandbox provider, logs UI.
6. **Expansion Features** — finance models, more providers, outbound webhooks, scheduled sync, field mapping, embedded connection UI.

## Sources

- **Merge docs llms index** — HIGH confidence. Documents unified API categories, API key + account-token auth, common models, cursor pagination, rate limits, sync frequency, webhooks, incremental sync with `modified_after`, writes, `/meta`, passthrough, remote data, field mapping, custom objects, scopes, sandboxes, Agent Handler/MCP. https://docs.merge.dev/llms.txt
- **Apideck Unified APIs index** — HIGH confidence. Documents supported unified API categories and platform APIs including Vault, Webhooks, Proxy, Connector, Ecosystem, API Explorer, SDKs, logs. https://developers.apideck.com/apis
- **Apideck Vault API reference** — HIGH confidence. Documents consumers, connections, OAuth/token validation, callback state, resource config/schema/example, custom fields, custom mappings, sessions, logs. https://developers.apideck.com/apis/vault/reference
- **Apideck Webhook API reference** — HIGH confidence. Documents webhook subscriptions, execution, verification/resolve flows, and event logs. https://developers.apideck.com/apis/webhook/reference
- **Nango introduction** — HIGH confidence. Documents auth, credentials, token refresh, 800+ APIs, functions, retries, rate limits, observability, environments, tenant isolation, syncs, webhooks, tool-calling/MCP. https://docs.nango.dev/
- **Nango Functions guide** — HIGH confidence. Documents actions, syncs, webhooks, schedules, retries, rate-limit handling, logs, OpenTelemetry, records storage, checkpoints, metadata, dry runs, testing, CI/CD, webhooks. https://docs.nango.dev/guides/functions/functions-guide
- **Nango Observability guide** — HIGH confidence. Documents comprehensive operations/log messages, filtering by integration/connection/function/status, custom logs, OpenTelemetry export. https://docs.nango.dev/guides/platform/observability
- **Workato docs landing page** — MEDIUM confidence for broad iPaaS feature categories. Documents process automation, workflow apps, data orchestration, API platform, event streams, connectors, connector SDK, lifecycle/operations, developer API, embedded, agentic/MCP. https://docs.workato.com/
- **Zapier Platform docs** — MEDIUM confidence for connector-builder/workflow ecosystem patterns. Documents Visual Builder, CLI, authentication, triggers, actions, searches, deployment/testing, marketplace promotion. https://docs.zapier.com/platform
- **Open iPaaS project/codebase context** — HIGH confidence for current capabilities and gaps. `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/CONCERNS.md`.

---
*Feature research for: unified API/iPaaS developer platform*  
*Researched: 2026-05-24*
