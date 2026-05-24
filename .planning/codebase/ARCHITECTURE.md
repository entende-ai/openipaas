# Architecture

**Analysis Date:** 2026-05-24

## Pattern Overview

**Overall:** Next.js App Router full-stack monolith with a provider-adapter integration core

**Key Characteristics:**
- Next.js App Router owns UI pages, API route handlers, server actions, and middleware under `src/app/` and `src/middleware.ts`.
- Unified public API routes under `src/app/api/unified/v1/` authenticate once, select a linked ERP provider, call provider-specific adapters, and return canonical records from `src/types/unified.ts`.
- Prisma-backed persistence stores clients, API keys, linked accounts, and OAuth credentials using `prisma/schema.prisma` and the singleton client in `src/lib/prisma.ts`.
- Provider implementations in `src/lib/providers/implementations/` translate external ERP behavior into the `IUnifiedProvider` contract in `src/lib/providers/IProvider.ts`.
- Mapping and validation functions in `src/lib/mappers/` and `src/lib/validations/unified-schemas.ts` normalize provider payloads into English-first unified models.
- Dashboard pages under `src/app/dashboard/` are internal admin surfaces that read/write database state through server components and server actions.

## Layers

**Presentation Layer:**
- Purpose: Render the landing page, API documentation, and dashboard UI.
- Contains: App Router pages, layouts, client components, shared UI primitives, global CSS.
- Location: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/docs/page.tsx`, `src/app/dashboard/**`, `src/components/**`, `src/app/globals.css`.
- Depends on: React, Next.js App Router, `src/components/ui/**`, `src/lib/openapi.ts`, `src/lib/prisma.ts` for server-rendered dashboard pages.
- Used by: Browser requests to `/`, `/docs`, and `/dashboard/*`.

**Dashboard Mutation Layer:**
- Purpose: Handle internal admin mutations for clients, API keys, linked accounts, OAuth connection helpers, and local API tests.
- Contains: Next.js server actions marked with `"use server"`.
- Location: `src/app/actions/client.ts`, `src/app/actions/linked-account.ts`, `src/app/actions/oauth.ts`, `src/app/actions/test-api.ts`.
- Depends on: `src/lib/prisma.ts`, `next/cache`, Node `crypto`, and environment variables such as `NEXT_PUBLIC_APP_URL`.
- Used by: Client dialogs/buttons under `src/app/dashboard/**/components/`.

**API Boundary Layer:**
- Purpose: Expose HTTP endpoints for OAuth callbacks and unified ERP resources.
- Contains: App Router `route.ts` files exporting HTTP verb handlers.
- Location: `src/app/api/oauth/callback/conta-azul/route.ts` and `src/app/api/unified/v1/**/route.ts`.
- Depends on: `src/lib/api-auth.ts`, `src/lib/providers/ProviderFactory.ts`, direct helpers in `src/lib/unified-api-utils.ts`, and mappers in `src/lib/mappers/`.
- Used by: External API consumers and internal dashboard test action `src/app/actions/test-api.ts`.

**Authentication and Tenant Resolution Layer:**
- Purpose: Convert request headers into a validated `UnifiedAuthContext` containing `client`, `linkedAccount`, and `credential`.
- Contains: Higher-order route wrapper `withUnifiedAuth` and context interface.
- Location: `src/lib/api-auth.ts`.
- Depends on: `src/lib/prisma.ts`, Prisma models from `@prisma/client`, `NextRequest`, and `NextResponse`.
- Used by: Unified API route exports such as `src/app/api/unified/v1/customers/route.ts`, `src/app/api/unified/v1/products/route.ts`, and `src/app/api/unified/v1/sales/route.ts`.

**Provider Adapter Layer:**
- Purpose: Hide external ERP API differences behind `IUnifiedProvider`.
- Contains: Provider interface, factory, concrete providers, provider-specific request helpers.
- Location: `src/lib/providers/IProvider.ts`, `src/lib/providers/ProviderFactory.ts`, `src/lib/providers/implementations/ContaAzulProvider.ts`, `src/lib/providers/implementations/OmieProvider.ts`, `src/lib/providers/implementations/TinyProvider.ts`, `src/lib/unified-api-utils.ts`, `src/lib/omie-utils.ts`, `src/lib/token-refresh.ts`.
- Depends on: Unified types in `src/types/unified.ts`, mappers in `src/lib/mappers/**`, external ERP HTTP APIs, and Prisma credential storage.
- Used by: Unified API route handlers in `src/app/api/unified/v1/**/route.ts`.

**Mapping and Schema Layer:**
- Purpose: Convert external provider payloads into canonical records and validate the unified shape.
- Contains: Provider payload types, unified types, Zod schemas, mapper functions.
- Location: `src/types/unified.ts`, `src/types/contaazul.ts`, `src/types/contaazul_products.ts`, `src/types/contaazul_sales.ts`, `src/lib/mappers/contaazul.ts`, `src/lib/mappers/omie-customers.ts`, `src/lib/mappers/products.ts`, `src/lib/mappers/sales.ts`, `src/lib/validations/unified-schemas.ts`.
- Depends on: TypeScript types and `zod`.
- Used by: Providers, direct route handlers, tests in `src/tests/mappers/**`, and OpenAPI documentation in `src/lib/openapi.ts`.

**Persistence Layer:**
- Purpose: Store consumers, API keys, ERP account links, and OAuth credentials.
- Contains: Prisma schema, generated client usage, seed data.
- Location: `prisma/schema.prisma`, `src/lib/prisma.ts`, `prisma/seed.ts`.
- Depends on: PostgreSQL via `DATABASE_URL` and `@prisma/client`.
- Used by: `src/lib/api-auth.ts`, dashboard pages in `src/app/dashboard/**/page.tsx`, server actions in `src/app/actions/**`, token refresh in `src/lib/token-refresh.ts`, and OAuth callback `src/app/api/oauth/callback/conta-azul/route.ts`.

**Tooling and Generation Layer:**
- Purpose: Generate provider scaffolds and bootstrap local/deployed runtime.
- Contains: Provider generator script, Docker entrypoint, Docker Compose, Prisma seed.
- Location: `scripts/generate-provider.ts`, `docker-entrypoint.sh`, `docker-compose.yml`, `Dockerfile`, `prisma/seed.ts`.
- Depends on: Node/tsx, Prisma CLI, PostgreSQL service.
- Used by: Developer workflow through `npm run generate-provider`, `npm run setup`, `npm run dev:docker`, and deployment startup.

## Data Flow

**Unified API Request:**

1. External caller sends `Authorization: Bearer <api key>` plus `X-Account-Token` to a route such as `src/app/api/unified/v1/customers/route.ts:30`.
2. The exported handler is wrapped by `withUnifiedAuth` from `src/lib/api-auth.ts:17`.
3. `withUnifiedAuth` reads the API key from `Authorization`, loads the `ApiKey` and `Client` through `prisma.apiKey.findUnique` in `src/lib/api-auth.ts:28`, then reads the `LinkedAccount` and credentials through `prisma.linkedAccount.findUnique` in `src/lib/api-auth.ts:43`.
4. The route handler extracts method/query/body details, then asks `ProviderFactory.getProvider(linkedAccount.provider)` in `src/lib/providers/ProviderFactory.ts:6` for the provider adapter.
5. The provider calls an external ERP through `src/lib/unified-api-utils.ts` for Conta Azul or `src/lib/omie-utils.ts` for Omie.
6. Mapper functions such as `mapContaAzulListToUnified` from `src/lib/mappers/contaazul.ts` or `mapContaAzulProductListToUnified` from `src/lib/mappers/products.ts` convert raw provider data to `src/types/unified.ts` records.
7. The route returns `NextResponse.json(...)` from the handler, as in `src/app/api/unified/v1/customers/route.ts:17`, `src/app/api/unified/v1/products/route.ts:17`, and `src/app/api/unified/v1/sales/route.ts:17`.

**Conta Azul Token Refresh:**

1. A provider or route calls `unifiedErpRequestWithRetry` in `src/lib/unified-api-utils.ts:39`.
2. `contaAzulRequest` in `src/lib/unified-api-utils.ts:3` fetches `https://api-v2.contaazul.com/v1` with the current access token.
3. A 401 response becomes a `TOKEN_EXPIRED` error in `src/lib/unified-api-utils.ts:18`.
4. `unifiedErpRequestWithRetry` catches `TOKEN_EXPIRED`, calls `refreshErpToken(credentialId)` in `src/lib/token-refresh.ts:3`, and retries the original request with the updated token.
5. `refreshErpToken` loads the credential from Prisma, exchanges the refresh token at `https://auth.contaazul.com/oauth2/token`, updates `OAuthCredential`, and returns the updated record from `src/lib/token-refresh.ts:49`.

**Dashboard Client/API Key Management:**

1. A browser requests `/dashboard/clients`; `src/middleware.ts:4` redirects dashboard paths to `/`, so dashboard pages are structurally present but blocked by middleware.
2. When accessible, `src/app/dashboard/clients/page.tsx:8` renders a server component that reads clients with `prisma.client.findMany` from `src/app/dashboard/clients/page.tsx:9`.
3. Client-side dialog/button components under `src/app/dashboard/clients/components/` submit to server actions.
4. `createClient` in `src/app/actions/client.ts:7` creates a `Client`; `generateApiKey` in `src/app/actions/client.ts:20` creates an `ApiKey` with `sk_live_` prefix.
5. Server actions call `revalidatePath('/dashboard/clients')` in `src/app/actions/client.ts:16` and `src/app/actions/client.ts:30` so the dashboard re-renders fresh data.

**OAuth Conta Azul Callback:**

1. Conta Azul redirects to `src/app/api/oauth/callback/conta-azul/route.ts:4` with `code` and `state` query parameters.
2. The handler treats `state` as `clientId` in `src/app/api/oauth/callback/conta-azul/route.ts:7`.
3. The handler exchanges the authorization code at `https://auth.contaazul.com/oauth2/token` in `src/app/api/oauth/callback/conta-azul/route.ts:34`.
4. The handler finds or creates a `LinkedAccount`, then updates or creates an `OAuthCredential` in `src/app/api/oauth/callback/conta-azul/route.ts:59` through `src/app/api/oauth/callback/conta-azul/route.ts:111`.
5. The handler redirects to `/dashboard/linked-accounts?success=true` in `src/app/api/oauth/callback/conta-azul/route.ts:115`.

**Provider Generation:**

1. Developer runs `npm run generate-provider <name>` from `package.json:16`.
2. `scripts/generate-provider.ts:4` reads the provider name from `process.argv[2]`.
3. The script writes a provider implementation to `src/lib/providers/implementations/{Name}Provider.ts` and a smoke test to `src/tests/mappers/{name}.test.ts` using paths built in `scripts/generate-provider.ts:77` and `scripts/generate-provider.ts:78`.
4. The script instructs the developer to register the provider in `src/lib/providers/ProviderFactory.ts` at `scripts/generate-provider.ts:90`.

**State Management:**
- Persistent state is PostgreSQL through Prisma models in `prisma/schema.prisma`.
- Runtime database access uses the global Prisma singleton in `src/lib/prisma.ts` to avoid duplicate clients during development reloads.
- Request context is per-call and passed as `UnifiedAuthContext` from `src/lib/api-auth.ts` into route handlers.
- Client-side UI state is local React state in client components, such as `useState` in `src/app/page.tsx:3` and dashboard dialog components under `src/app/dashboard/**/components/`.
- The only shared module-level mutable state is `globalThis.prismaGlobal` in `src/lib/prisma.ts:7`.

## Key Abstractions

**Unified Provider:**
- Purpose: Common adapter contract for all ERP connectors.
- Examples: `src/lib/providers/IProvider.ts`, `src/lib/providers/implementations/ContaAzulProvider.ts`, `src/lib/providers/implementations/OmieProvider.ts`, `src/lib/providers/implementations/TinyProvider.ts`.
- Pattern: Interface plus concrete adapter classes selected by a factory.

**Provider Factory:**
- Purpose: Resolve a `LinkedAccount.provider` string into an `IUnifiedProvider` instance.
- Examples: `src/lib/providers/ProviderFactory.ts`.
- Pattern: Static factory with a `switch` on `providerName.toUpperCase()`.

**Unified Auth Context:**
- Purpose: Bundle authenticated client identity, linked provider account, and credential for route handlers.
- Examples: `src/lib/api-auth.ts`, `src/app/api/unified/v1/customers/route.ts`, `src/app/api/unified/v1/products/route.ts`, `src/app/api/unified/v1/sales/route.ts`.
- Pattern: Higher-order route handler wrapper.

**Unified Data Models:**
- Purpose: Canonical public API shapes independent of provider terminology.
- Examples: `UnifiedCustomer`, `UnifiedProduct`, `UnifiedSale`, `UnifiedSeller`, and `UnifiedListResponse` in `src/types/unified.ts`.
- Pattern: TypeScript interfaces mirrored by Zod schemas in `src/lib/validations/unified-schemas.ts`.

**Mapper Functions:**
- Purpose: Convert provider-specific payloads to canonical models and include raw data under `remoteData`.
- Examples: `src/lib/mappers/contaazul.ts`, `src/lib/mappers/omie-customers.ts`, `src/lib/mappers/products.ts`, `src/lib/mappers/sales.ts`.
- Pattern: Pure transformation functions, usually validated with Zod before returning.

**Prisma Singleton:**
- Purpose: Provide one reusable Prisma client instance across server-side modules.
- Examples: `src/lib/prisma.ts`.
- Pattern: `globalThis` singleton in development and direct module export in production.

**OpenAPI Specification:**
- Purpose: Describe the public unified API for interactive documentation.
- Examples: `src/lib/openapi.ts`, `src/app/docs/page.tsx`.
- Pattern: In-code OpenAPI 3.1 object consumed by Scalar React.

## Entry Points

**Application Root Layout:**
- Location: `src/app/layout.tsx`.
- Triggers: Every App Router page render.
- Responsibilities: Define metadata, load `Inter`, attach `ThemeProvider`, and inject Vercel Analytics.

**Landing Page:**
- Location: `src/app/page.tsx`.
- Triggers: Browser request to `/`.
- Responsibilities: Render client-side animated marketing page with provider logo visuals and GitHub CTA.

**API Documentation Page:**
- Location: `src/app/docs/page.tsx`.
- Triggers: Browser request to `/docs`.
- Responsibilities: Render Scalar API Reference with `openApiSpec` from `src/lib/openapi.ts`.

**Dashboard Pages:**
- Location: `src/app/dashboard/clients/page.tsx`, `src/app/dashboard/linked-accounts/page.tsx`, `src/app/dashboard/logs/page.tsx`.
- Triggers: Browser requests to `/dashboard/clients`, `/dashboard/linked-accounts`, and `/dashboard/logs` when not redirected by middleware.
- Responsibilities: Display clients/API keys, linked ERP accounts, and logs UI.

**Dashboard Middleware:**
- Location: `src/middleware.ts`.
- Triggers: Requests matching `/dashboard/:path*`.
- Responsibilities: Redirect dashboard requests to `/`.

**Unified API Routes:**
- Location: `src/app/api/unified/v1/**/route.ts`.
- Triggers: HTTP requests under `/api/unified/v1/*`.
- Responsibilities: Authenticate requests, route to provider adapters or direct request helpers, map provider payloads, and return JSON responses.

**Conta Azul OAuth Callback:**
- Location: `src/app/api/oauth/callback/conta-azul/route.ts`.
- Triggers: OAuth redirect from Conta Azul.
- Responsibilities: Exchange authorization code, persist linked account and credential, redirect to linked accounts dashboard.

**Provider Generator CLI:**
- Location: `scripts/generate-provider.ts`.
- Triggers: `npm run generate-provider <name>` from `package.json`.
- Responsibilities: Scaffold provider implementation and test file.

**Database Seed:**
- Location: `prisma/seed.ts`.
- Triggers: `npx prisma db seed` or `npm run setup` from `package.json`.
- Responsibilities: Reset local integration data and create development client/API key/account fixtures.

**Docker Entrypoint:**
- Location: `docker-entrypoint.sh`.
- Triggers: Container startup through `Dockerfile`/deployment.
- Responsibilities: Run database bootstrap and start the standalone Next.js server.

## Error Handling

**Strategy:** Route handlers catch provider/database/external API errors locally and return JSON error responses; authentication errors are converted to 4xx responses by `withUnifiedAuth`; provider request helpers throw `Error` instances for callers to catch.

**Patterns:**
- Use `NextResponse.json({ error: ... }, { status })` at HTTP boundaries, as in `src/lib/api-auth.ts`, `src/app/api/unified/v1/customers/route.ts`, and `src/app/api/oauth/callback/conta-azul/route.ts`.
- Log provider failures with `console.error` before returning a 500 response in route handlers such as `src/app/api/unified/v1/customers/route.ts:25` and `src/app/api/unified/v1/sales/route.ts:23`.
- Throw explicit provider errors for unsupported operations in `src/lib/providers/ProviderFactory.ts`, `src/lib/providers/implementations/OmieProvider.ts`, and `src/lib/providers/implementations/TinyProvider.ts`.
- Treat Conta Azul 401 as `TOKEN_EXPIRED` in `src/lib/unified-api-utils.ts:18` and retry through `src/lib/token-refresh.ts`.
- Return structured server-action result objects like `{ success: true }` or `{ error: string }` from `src/app/actions/client.ts`, `src/app/actions/linked-account.ts`, and `src/app/actions/test-api.ts`.

## Cross-Cutting Concerns

**Logging:**
- Use `console.log` for operational progress in `src/lib/token-refresh.ts`, `src/lib/unified-api-utils.ts`, `prisma/seed.ts`, and `scripts/generate-provider.ts`.
- Use `console.error` for API/auth/provider failures in `src/lib/api-auth.ts`, `src/lib/unified-api-utils.ts`, `src/lib/omie-utils.ts`, and `src/app/api/unified/v1/**/route.ts`.

**Validation:**
- Request header validation is centralized in `src/lib/api-auth.ts`.
- Unified output validation is available through Zod schemas in `src/lib/validations/unified-schemas.ts` and used by mappers such as `src/lib/mappers/contaazul.ts` and `src/lib/mappers/omie-customers.ts`.
- Some route JSON body validation is manual, such as the `try { await req.json() }` branch in `src/app/api/unified/v1/products/[id]/route.ts:17`.

**Authentication:**
- Public unified API requests require both `Authorization: Bearer <api key>` and `X-Account-Token`, enforced by `src/lib/api-auth.ts`.
- OAuth credentials are stored in `OAuthCredential` from `prisma/schema.prisma` and refreshed by `src/lib/token-refresh.ts`.
- Dashboard access is not authenticated in the page code; it is currently redirected away by `src/middleware.ts`.

**Provider Extensibility:**
- Add provider classes under `src/lib/providers/implementations/`, implement `IUnifiedProvider`, add mapping code under `src/lib/mappers/`, and register the provider in `src/lib/providers/ProviderFactory.ts`.
- Use `scripts/generate-provider.ts` for scaffolding, then replace placeholder methods and tests.

**Documentation:**
- Public API docs are defined in `src/lib/openapi.ts` and rendered by `src/app/docs/page.tsx`.
- Keep `src/lib/openapi.ts` synchronized with actual `src/app/api/unified/v1/**/route.ts` behavior when adding endpoints.

---

*Architecture analysis: 2026-05-24*
*Update when major patterns change*
