# Open iPaaS

## What This Is

Open iPaaS is a unified API platform for connecting many external business systems through one stable API surface. The current codebase already exposes a Next.js API and dashboard foundation for ERP integrations, with provider adapters for Conta Azul, partial Omie support, and a Tiny stub; the project direction is to expand beyond ERPs into varied apps while keeping a consistent developer-facing contract.

External developers should be able to call specific unified routes without caring which ERP, CRM, commerce platform, finance app, logistics system, or other provider is behind the account. Internally, the platform should make it progressively easier and safer to add new software connectors, normalize their APIs, manage credentials, and document capabilities.

## Core Value

Developers can integrate once against a stable unified API while Open iPaaS handles provider-specific authentication, data mapping, errors, and connector differences behind the scenes.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Next.js full-stack foundation exists with App Router pages, API routes, server actions, middleware, and Docker support — existing codebase
- ✓ PostgreSQL persistence exists for clients, API keys, linked accounts, and OAuth credentials through Prisma — existing codebase
- ✓ Unified API authentication exists using bearer API keys plus `X-Account-Token` account selection — existing codebase
- ✓ Unified API routes exist for customers, products, sales, sellers, categories, brands, units, NCM, CEST, bulk actions, connected account, and PDF retrieval — existing codebase
- ✓ Provider adapter layer exists with `IUnifiedProvider`, `ProviderFactory`, Conta Azul implementation, partial Omie implementation, and Tiny stub — existing codebase
- ✓ Mapping and validation layer exists for canonical customer/product/sales shapes using TypeScript and Zod — existing codebase
- ✓ Interactive OpenAPI documentation exists through Scalar and `src/lib/openapi.ts` — existing codebase
- ✓ Internal dashboard code exists for clients, API keys, linked accounts, logs, OAuth connection helpers, and local API testing — existing codebase
- ✓ Provider scaffolding script exists through `scripts/generate-provider.ts` — existing codebase

### Active

<!-- Current scope. Building toward these. -->

- [ ] Make provider integration truly extensible so new apps can be added with a hybrid flow: generated scaffold plus explicit provider-specific implementation where APIs differ.
- [ ] Support app-varied expansion beyond ERPs while keeping the initial domain emphasis on customers, products, catalog, orders/sales, and financial data.
- [ ] Stabilize the unified API contract so external developers can consume core resources without knowing which provider backs the account.
- [ ] Improve connector onboarding so adding a new software provider includes scaffolded files, capability registration, tests, OpenAPI documentation, and clear unsupported-method behavior.
- [ ] Decide and implement the canonical contract strategy for each domain, balancing strict normalized fields with provider-specific metadata or raw data controls.
- [ ] Harden multi-tenant authentication and credential handling, including API keys, account tokens, OAuth credentials, provider secrets, token refresh, and safe secret display.
- [ ] Make the dashboard usable and safe for internal operations: client setup, linked account setup, credential management, route testing, and integration visibility.
- [ ] Align OpenAPI documentation with actual route/provider capabilities so developer-facing docs do not drift from runtime behavior.
- [ ] Add stable public error handling, validation, and provider timeout/retry behavior so external developers receive predictable responses.
- [ ] Build toward a v1 where a new app can be added quickly, the unified API is stable, and the dashboard supports operational setup.

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Native mobile applications — the current value is API/platform infrastructure, not a mobile client.
- Replacing provider systems of record — Open iPaaS normalizes access to external systems; it is not the source ERP/CRM/commerce database.
- A fully no-code connector marketplace as the first milestone — useful later, but v1 must first prove the connector contract, scaffold, docs, security, and core resources.
- Real-time sync as a required first capability for every provider — webhooks/events may be added where needed, but the initial foundation should not depend on all providers supporting real-time behavior.

## Context

The repository is a brownfield Next.js 16 / React 19 / Prisma / PostgreSQL application. Codebase mapping lives in `.planning/codebase/` and should be treated as the baseline for planning.

Current architecture:
- `src/app/api/unified/v1/**` exposes the public unified API.
- `src/lib/api-auth.ts` resolves API key and linked account context from request headers.
- `src/lib/providers/**` contains the provider interface, factory, and provider implementations.
- `src/lib/mappers/**`, `src/types/**`, and `src/lib/validations/unified-schemas.ts` define and validate normalized data shapes.
- `src/lib/openapi.ts` backs the interactive docs page at `src/app/docs/page.tsx`.
- `src/app/dashboard/**` and `src/app/actions/**` contain internal operational UI and mutations, but dashboard access is currently blocked by middleware.

Known issues from codebase mapping that should shape roadmap priorities:
- Some unified routes still contain provider-specific branching instead of using the provider abstraction consistently.
- Generated providers can behave like production stubs and are not automatically registered.
- The integration boundary uses too much `any`, reducing type safety for credentials, queries, payloads, and mapper inputs.
- OpenAPI docs can drift from implemented route/provider behavior.
- Request/query validation is not enforced uniformly before upstream provider calls.
- Dashboard access is blocked by middleware, but removing the block would expose unauthenticated admin actions.
- API keys and OAuth/provider tokens are stored in plaintext and some secrets can be displayed.
- OAuth `state` is only a client ID and needs nonce/signature/expiry/session binding.
- Provider error messages and raw upstream payloads can leak implementation or sensitive data.
- Upstream calls lack shared timeout, retry/backoff, circuit breaker, and structured error behavior.

The project should optimize for external developer trust: stable contracts, clear docs, predictable errors, and minimal provider-specific surprises.

## Constraints

- **Runtime**: Next.js 16 has project-specific breaking-change guidance; consult `node_modules/next/dist/docs/` before modifying Next.js APIs or conventions.
- **Stack**: Preserve the existing TypeScript, Next.js App Router, Prisma, PostgreSQL, Zod, and Vitest foundation unless a later decision explicitly changes it.
- **Brownfield architecture**: Plans should evolve the current provider-adapter architecture rather than replacing the application wholesale.
- **Security**: Credential storage, API key handling, OAuth state, dashboard authorization, and error redaction are first-class constraints because this platform brokers access to external business systems.
- **Developer experience**: Public route behavior, OpenAPI docs, generated connector scaffolds, and tests must stay aligned because external developers are the primary v1 users.
- **Extensibility**: Connector support must not require route-by-route provider branching; provider-specific behavior should live behind contracts, capability metadata, and provider implementations.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prioritize apps variados, not only ERPs | The platform should expand to ERPs, CRMs, commerce, finance, logistics, and other APIs behind one unified layer | — Pending |
| External developers are the primary v1 users | The core product promise is integration once through a stable API; internal dashboard supports that promise | — Pending |
| Core v1 domains include customers, products/catalog, orders/sales, and finance | These cover current implemented resources and the next expansion areas needed for business system integrations | — Pending |
| Connector onboarding should be hybrid | A generator/scaffold should reduce boilerplate, while provider-specific API differences still need explicit implementation | — Pending |
| Canonical contract strategy is intentionally undecided | The project should determine strict-vs-flexible behavior per domain during planning and implementation | — Pending |
| v1 quality requires new app speed, API stability, and operational dashboard usefulness | These are the user's stated signals that the foundation is ready to build on | — Pending |
| Security must cover OAuth, API keys, credential storage, and multi-tenant isolation together | Partial hardening would leave the integration platform unsafe for real external systems | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-24 after initialization*
