# Project Research Summary

**Project:** Open iPaaS  
**Domain:** Unified API / iPaaS platform for business applications  
**Researched:** 2026-05-24  
**Confidence:** HIGH  

## Executive Summary

Open iPaaS is a unified API platform designed to provide developers with a stable, consistent interface for connecting to diverse business applications (ERPs, CRMs, commerce, finance, logistics systems). Based on research of industry patterns and the current codebase, the recommended approach is to evolve the existing Next.js/TypeScript monolith into a modular architecture with strong internal boundaries between the public API contract, connector runtime, and operational concerns. The platform should prioritize security, contract stability, and developer trust before expanding connector support or adding advanced features.

Key risks include API contract drift, insecure credential handling, and premature expansion without proper capability modeling. These can be mitigated through phased implementation focusing first on establishing a secure foundation, stabilizing canonical contracts, and building observable, resilient provider integrations.

## Key Findings

### Recommended Stack

The research confirms keeping the existing Next.js 16 + TypeScript foundation while adding specific technologies to strengthen the platform. Core recommendations include:

- **PostgreSQL + Prisma ORM**: Keep as system of record for tenants, credentials, and audit data; upgrade Prisma deliberately after auth tests exist
- **Zod + zod-openapi**: Maintain Zod as canonical contract layer and use zod-openapi to generate OpenAPI 3.1 from schemas to prevent docs drift
- **Shared Provider HTTP Client**: Implement centralized fetch wrapper with timeout, retry/backoff, redaction, and error normalization for all upstream calls
- **BullMQ + Redis/Valkey**: Use for background jobs (bulk operations, scheduled syncs, retries) rather than overloading request handlers
- **Better Auth + Argon2**: For dashboard authentication and secure API key lifecycle management (hashing, rotation, revocation)

### Expected Features

**Must have (table stakes):**
- Stable unified resource models for customers, products, orders - core promise of "integrate once"
- Secure credential storage with hashed API keys and encrypted provider tokens
- Provider connection lifecycle management (create, validate, revoke, inspect connections)
- Provider capability discovery to know what each provider supports before calling
- OpenAPI docs that match runtime behavior to build developer trust
- Predictable error model with stable public codes and correlation IDs
- Request validation before provider calls to prevent invalid input reaching upstream systems

**Should have (competitive):**
- Brazil/LatAm-first coverage focusing on Conta Azul, Omie, Tiny, Bling with localized fiscal concepts
- Capability-aware docs and runtime explorer showing exactly what each provider supports
- Hybrid canonical + controlled provider extensions to balance normalization with provider-specific data
- Connector quality score / readiness gates to make connector maturity explicit
- Account-level configuration/mapping for enterprise customization needs

**Defer (v2+):**
- Full no-code workflow builder - distracts from stable API foundation
- Connector marketplace - requires proven connector quality and trust first
- Real-time sync for every provider - support webhooks where available, otherwise incremental reads
- Public self-service admin portal - requires solid auth/RBAC/audit foundations first
- AI agent features - requires strong scopes, schemas, and reliable writes

### Architecture Approach

The platform should adopt a modular monolith architecture with clear internal boundaries:

1. **Public/API Plane**: Thin Next.js route handlers that authenticate, validate requests, check provider capabilities, and dispatch to connector runtime
2. **Contract Plane**: Centralized canonical models, request/response schemas, error envelopes, and pagination conventions owned by lib/unified/
3. **Integration Runtime Plane**: Provider registry, adapter interface, shared HTTP client with retry/timeout/rate-limit handling, mapper/normalizer layer
4. **Connection/Security Plane**: Client/account identity, credential storage (hashed API keys, encrypted OAuth tokens), OAuth state management
5. **Async/Sync Plane**: Background job workers for bulk operations, webhooks, incremental syncs with checkpoints
6. **Data/Operations Plane**: PostgreSQL/Prisma persistence, audit logs, request logs, internal dashboard, health monitoring

Key patterns include thin routes with capability gates, provider modules as self-describing plugins, common models with explicit extension points, shared provider HTTP client, and docs generated from contract metadata.

### Critical Pitfalls

Top pitfalls to avoid based on research:
1. **Treating unified API as route glue** - Avoid provider-specific branching in routes; move operations behind connector contract with capability metadata
2. **Generated stubs looking production-ready** - Generate fail-closed providers that return deterministic 501 errors for unsupported methods until explicitly implemented
3. **Bad canonical schema strategy** - Define domain-specific contracts (customers, products/orders, finance) with strict normalized fields and typed extension points; hide raw data by default
4. **OpenAPI drift from runtime** - Generate or test OpenAPI from schemas + capability metadata; treat spec as build artifact with CI diff review
5. **Plaintext secrets** - Hash API keys with Argon2, encrypt provider credentials, add key lifecycle metadata, redact from logs/dashboard
6. **Weak OAuth state** - Replace clientId with signed, random, one-time state containing nonce, client/account/provider binding, expiry
7. **Unblocking dashboard prematurely** - Add admin auth + action authorization before enabling dashboard; never expose without strong authentication
8. **Missing provider resilience** - Implement shared HTTP client with timeouts, retries, rate-limit handling, circuit breakers before scaling
9. **Retrying mutating operations without idempotency** - Require idempotency keys for public mutating endpoints; store idempotency records
10. **Expanding app categories before capability modeling** - Add new domains only after capability matrix exists; pilot with two providers before generalizing

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Provider Contract & Capability Registry
**Rationale:** Establish the foundation for extensible provider integration before adding more connectors; prevents architecture drift
**Delivers:** Provider registry with metadata/capabilities, deterministic unsupported operation handling, provider module boundary
**Addresses:** Provider connection lifecycle, capability discovery, connector onboarding workflow
**Avoids:** Route glue instead of connector contract, production-looking stubs

### Phase 2: Canonical Resource Contracts & Validation
**Rationale:** Stabilize public resource semantics and input validation before exposing to external developers
**Delivers:** Domain-specific canonical models (customers, products/orders), Zod request/response validation, public error taxonomy
**Addresses:** Stable unified resource models, request validation, predictable error model
**Avoids:** Bad canonical schema strategy, provider-shaped validation/errors

### Phase 3: API Contract, OpenAPI, and Developer Trust
**Rationale:** Build developer trust by ensuring documentation matches runtime behavior and defining clear error/idempotency expectations
**Delivers:** Generated/verified OpenAPI docs, public idempotency behavior, stable public error codes with correlation IDs
**Addresses:** OpenAPI/runtime alignment, developer experience (SDKs/examples), predictable error model
**Avoids:** OpenAPI drift, docs promising unsupported operations

### Phase 4: Security Hardening: Credentials, OAuth, and Multi-Tenant Isolation
**Rationale:** Protect connected business systems before handling real customer credentials or enabling dashboard
**Delivers:** Trusted API key hashing, encrypted provider credentials, secure OAuth state, tenant/account ownership validation
**Addresses:** Secure credential storage, admin auth for dashboard/actions, API key lifecycle
**Avoids:** Plaintext secrets, weak OAuth state, weak tenant/account isolation, unauthenticated dashboard

### Phase 5: Safe Operations Dashboard
**Rationale:** Unlock internal operations only after establishing strong authentication and authorization boundaries
**Delivers:** Authenticated dashboard with admin auth, action authorization, audit logging, secret redaction
**Addresses:** Operational dashboard for internal setup/support, dashboard unlock
**Avoids:** Unsafe dashboard, exposing secrets through dashboard

### Phase 6: Provider Resilience & Observability
**Rationale:** Add reliability and observability foundations before scaling provider count or handling high-volume workloads
**Delivers:** Shared provider HTTP client with timeout/retry/rate-limit handling, structured logs/traces, idempotency for mutating ops
**Addresses:** Provider HTTP resilience, logs and observability, shared HTTP resilience layer
**Avoids:** Missing provider resilience, non-idempotent retries, upstream instability causing cascading failures

### Phase 7: Connector Expansion Playbook
**Rationale:** Scale connector support using the proven scaffold/capability/test pipeline established in earlier phases
**Delivers:** New production-quality connectors (Omie, Tiny, etc.), connector readiness scoring, internal health views
**Addresses:** Additional providers, internal logs/correlation IDs, connector onboarding system
**Avoids:** Premature app-category expansion, connector marketplace before quality gates

### Phase Ordering Rationale
- **Dependency-driven**: Each phase builds on the previous (security before dashboard, contracts before expansion)
- **Risk mitigation**: Addresses critical security and stability concerns before exposing to external users
- **Value delivery**: Early phases establish trust foundation; later phases expand utility
- **Pitfall avoidance**: Each phase specifically targets 2-3 critical pitfalls from research

### Research Flags
Phases likely needing deeper research during planning:
- **Phase 4 (Security Hardening)**: Complex integration of multiple security concerns (encryption, OAuth, authn/z) requires careful implementation validation
- **Phase 6 (Provider Resilience)**: Nuanced implementation of retry/backoff/circuit breaker patterns needs provider-specific tuning
- **Phase 7 (Connector Expansion)**: Domain-specific challenges when expanding beyond initial ERP focus to CRM/commerce/finance

Phases with standard patterns (skip research-phase):
- **Phase 1 (Provider Contract)**: Well-documented patterns in Merge/Apideck/Nango for provider registries and capability metadata
- **Phase 2 (Canonical Contracts)**: Established approaches to domain modeling in unified API platforms
- **Phase 3 (API Contract)**: Standard practices for OpenAPI generation from schemas and contract testing
- **Phase 5 (Safe Dashboard)**: Common patterns for admin dashboards with RBAC and audit logging

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Based on official docs, version checks, and Context7 libraries; clear consensus on recommended technologies |
| Features | HIGH | Based on multiple authoritative sources (Merge, Apideck, Nango docs) with clear v1 prioritization |
| Architecture | HIGH | Based on authoritative sources and alignment with current brownfield codebase |
| Pitfalls | HIGH | Based on official security guides (OWASP, RFCs) and codebase audit findings |

**Overall confidence:** HIGH

## Gaps to Address

- **Exact v1 feature ordering**: While feature priorities are clear, the precise sequencing within phases may need adjustment based on early user feedback
- **Brazil/LatAm-specific nuances**: Deep understanding of local fiscal concepts (NF-e, etc.) may require domain expert consultation during implementation
- **Observability tooling selection**: While patterns are clear, final choices for logging/tracing/metrics providers may benefit from prototyping
- **Horizontal scaling thresholds**: Precise triggers for moving from monolith to distributed services will need monitoring during v1

## Sources

### Primary (HIGH confidence)
- Merge docs llms index — Unified API categories, auth, models, pagination, webhooks, incremental sync
- Apideck Unified APIs index — Platform APIs including Vault, Webhooks, Proxy, Connector, SDKs, logs
- Nango introduction — Auth, credentials, token refresh, observability, syncs, webhooks, tool-calling
- OWASP REST Security Cheat Sheet — Input validation, generic errors, audit logs, API key management
- OWASP OAuth2 Cheat Sheet — State/PKCE/nonce guidance, token handling, refresh-token protection
- Microsoft Azure Architecture Center, Retry Pattern — Transient failures, backoff, idempotency concerns
- Microsoft Azure Architecture Center, Circuit Breaker Pattern — Prevent cascading failures, handle 429/503

### Secondary (MEDIUM confidence)
- Workato docs landing page — Process automation, workflow apps, API platform (for contrast with developer-first approach)
- Zapier Platform docs — Connector-builder/workflow ecosystem patterns (for contrast with developer-first approach)
- Open iPaaS project/codebase context — Current capabilities and gaps from existing implementation

### Tertiary (LOW confidence)
- Temporal TypeScript SDK docs — For potential future workflow orchestration needs
- Svix documentation — For outgoing webhook implementation details
- Jose library documentation — For signed OAuth state/JWT-like tokens implementation

---
*Research completed: 2026-05-24*
*Ready for roadmap: yes*