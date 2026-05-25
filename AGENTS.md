<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

# Open iPaaS Project Context

## What This Is
Open iPaaS is a unified API platform for connecting many external business systems through one stable API surface. The current codebase already exposes a Next.js API and dashboard foundation for ERP integrations, with provider adapters for Conta Azul, partial Omie support, and a Tiny stub; the project direction is to expand beyond ERPs into varied apps while keeping a consistent developer-facing contract.

External developers should be able to call specific unified routes without caring which ERP, CRM, commerce platform, finance app, logistics system, or other provider is behind the account. Internally, the platform should make it progressively easier and safer to add new software connectors, normalize their APIs, manage credentials, and document capabilities.

## Core Value
Developers can integrate once against a stable unified API while Open iPaaS handles provider-specific authentication, data mapping, errors, and connector differences behind the scenes.

## Constraints
- **Runtime**: Next.js 16 has project-specific breaking-change guidance; consult `node_modules/next/dist/docs/` before modifying Next.js APIs or conventions.
- **Stack**: Preserve the existing TypeScript, Next.js App Router, Prisma, PostgreSQL, Zod, and Vitest foundation unless a later decision explicitly changes it.
- **Brownfield architecture**: Plans should evolve the current provider-adapter architecture rather than replacing the application wholesale.
- **Security**: Credential storage, API key handling, OAuth state, dashboard authorization, and error redaction are first-class constraints because this platform brokers access to external business systems.
- **Developer experience**: Public route behavior, OpenAPI docs, generated connector scaffolds, and tests must stay aligned because external developers are the primary v1 users.
- **Extensibility**: Connector support must not require route-by-route provider branching; provider-specific behavior should live behind contracts, capability metadata, and provider implementations.

## Key Decisions
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prioritize apps variados, not only ERPs | The platform should expand to ERPs, CRMs, commerce, finance, logistics, and other APIs behind one unified layer | Pending |
| External developers are the primary v1 users | The core product promise is integration once through a stable API; internal dashboard supports that promise | Pending |
| Core v1 domains include customers, products/catalog, orders/sales, and finance | These cover current implemented resources and the next expansion areas needed for business system integrations | Pending |
| Connector onboarding should be hybrid | A generator/scaffold should reduce boilerplate, while provider-specific API differences still need explicit implementation | Pending |
| Canonical contract strategy is intentionally undecided | The project should determine strict-vs-flexible behavior per domain during planning and implementation | Pending |
| v1 quality requires new app speed, API stability, and operational dashboard usefulness | These are the user's stated signals that the foundation is ready to build on | Pending |
| Security must cover OAuth, API keys, credential storage, and multi-tenant isolation together | Partial hardening would leave the integration platform unsafe for real external systems | Pending |

## Current State
- **Current Phase**: 1 (Foundation and Extensibility)
- **Roadmap**: .planning/ROADMAP.md
- **Requirements**: .planning/REQUIREMENTS.md
- **Project**: .planning/PROJECT.md

## Workflow Preferences
- Mode: Interactive (user confirms each step)
- Granularity: Fine (many focused phases)
- Execution: Parallel (independent plans run simultaneously)
- Git Tracking: Yes (planning docs tracked in version control)
- Research: Yes (investigate domain before each phase)
- Plan Check: Yes (catch gaps before execution)
- Verifier: Yes (confirm deliverables match phase goals)
- AI Model: Balanced (Sonnet)
- PR Body Sections: All four enabled (User Stories & Acceptance Criteria, Risks & Dependencies, Success Metrics & Release Criteria, Stakeholder Review & Approval)

## Active Requirements (v1)
- Make provider integration truly extensible (hybrid scaffold + explicit implementation)
- Support app-varied expansion beyond ERPs (initial domain: customers, products, catalog, orders/sales, financial data)
- Stabilize the unified API contract
- Improve connector onboarding (scaffold + capability registration + tests + docs + unsupported-method behavior)
- Decide canonical contract strategy per domain
- Harden multi-tenant auth and credential handling
- Make dashboard usable and safe (client/account setup, credential management, route testing, integration visibility)
- Align OpenAPI docs with runtime behavior
- Add stable error handling, validation, timeout/retry
- Build toward v1 where new app can be added quickly, API stable, dashboard useful

---
*Last updated: 2026-05-24 after roadmap definition*
