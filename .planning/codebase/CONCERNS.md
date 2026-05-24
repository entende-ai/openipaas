# Codebase Concerns

**Analysis Date:** 2026-05-24

## Tech Debt

**Provider abstraction is only partially applied:**
- Issue: Some unified API routes use `ProviderFactory` while others still switch on `linkedAccount.provider` and call Conta Azul paths directly.
- Files: `src/app/api/unified/v1/customers/route.ts`, `src/app/api/unified/v1/products/route.ts`, `src/app/api/unified/v1/sales/route.ts`, `src/app/api/unified/v1/products/[id]/route.ts`, `src/app/api/unified/v1/customers/[id]/route.ts`, `src/app/api/unified/v1/customers/bulk/delete/route.ts`, `src/app/api/unified/v1/products/categories/route.ts`, `src/lib/providers/ProviderFactory.ts`
- Impact: Adding providers requires touching route code and duplicating request/mapping behavior, defeating the plugin boundary described in `README.md`.
- Fix approach: Move all provider-specific operations into `IUnifiedProvider` methods in `src/lib/providers/IProvider.ts`, make every route call a provider method, and keep provider switches isolated to `src/lib/providers/ProviderFactory.ts`.

**Generated providers create production stubs:**
- Issue: `scripts/generate-provider.ts` writes implementations that return empty lists or throw “not implemented”, and only reminds developers to register the provider manually.
- Files: `scripts/generate-provider.ts`, `src/lib/providers/implementations/TinyProvider.ts`, `src/tests/mappers/tiny.test.ts`, `src/lib/providers/ProviderFactory.ts`
- Impact: Stub providers can appear valid in tests while returning empty data in API paths; generated providers are not usable until manually wired into `ProviderFactory`.
- Fix approach: Generate explicit `501 Not Implemented` behavior or feature flags, generate contract tests that assert unsupported methods fail consistently, and update `ProviderFactory.ts` automatically or emit a failing test until registration exists.

**Loose typing across core integration boundary:**
- Issue: Provider credentials, query params, request bodies, and mapper raw payloads use `any` heavily.
- Files: `src/lib/providers/IProvider.ts`, `src/lib/providers/implementations/ContaAzulProvider.ts`, `src/lib/providers/implementations/OmieProvider.ts`, `src/lib/unified-api-utils.ts`, `src/lib/omie-utils.ts`, `src/lib/mappers/products.ts`, `src/lib/mappers/contaazul.ts`, `src/lib/validations/unified-schemas.ts`, `src/types/unified.ts`
- Impact: TypeScript cannot verify provider contracts, request body shapes, pagination parameters, or mapper inputs; schema validation catches some issues only after runtime calls.
- Fix approach: Define provider credential types, provider query DTOs, raw upstream response interfaces, and input schemas near `src/lib/validations/unified-schemas.ts`; keep `remoteData.raw` typed as `unknown` instead of `any`.

**OpenAPI contract drifts from implementation:**
- Issue: `src/lib/openapi.ts` documents create/update/delete operations and response shapes that are not consistently implemented or normalized by routes.
- Files: `src/lib/openapi.ts`, `src/app/api/unified/v1/products/route.ts`, `src/app/api/unified/v1/customers/route.ts`, `src/app/api/unified/v1/sales/route.ts`, `src/app/api/unified/v1/products/[id]/route.ts`
- Impact: Consumers can build against documented operations that return `501`, raw provider payloads, or different status codes at runtime.
- Fix approach: Generate the spec from route/provider capability metadata or add tests that compare documented methods in `src/lib/openapi.ts` against exported route handlers.

**Runtime validation is not enforced uniformly at API edges:**
- Issue: Mappers parse unified output with Zod, but API request bodies and query parameters are passed through directly to providers.
- Files: `src/lib/validations/unified-schemas.ts`, `src/app/api/unified/v1/products/[id]/route.ts`, `src/app/api/unified/v1/customers/[id]/route.ts`, `src/app/api/unified/v1/customers/bulk/delete/route.ts`, `src/app/api/unified/v1/sales/bulk/route.ts`
- Impact: Invalid payloads can be forwarded to upstream ERP APIs and fail with provider-specific errors instead of stable unified validation errors.
- Fix approach: Add Zod request/query schemas for each route in `src/lib/validations/unified-schemas.ts` and parse before provider calls.

## Known Bugs

**Dashboard is unreachable by design-time middleware:**
- Symptoms: Any request under `/dashboard` redirects to `/`, while the project contains dashboard pages for clients, linked accounts, and logs.
- Files: `src/middleware.ts`, `src/app/dashboard/clients/page.tsx`, `src/app/dashboard/linked-accounts/page.tsx`, `src/app/dashboard/logs/page.tsx`
- Trigger: Navigate to `/dashboard`, `/dashboard/clients`, or `/dashboard/linked-accounts`.
- Workaround: Remove or alter `src/middleware.ts` locally while developing dashboard functionality.
- Root cause: `middleware()` unconditionally redirects every `/dashboard/:path*` request without an authentication/session check.

**Conta Azul PDF download fails after token expiry:**
- Symptoms: PDF requests return a JSON error instead of refreshing the ERP token and retrying.
- Files: `src/lib/providers/implementations/ContaAzulProvider.ts`, `src/app/api/unified/v1/sales/[id]/pdf/route.ts`, `src/lib/unified-api-utils.ts`, `src/lib/token-refresh.ts`
- Trigger: Call `GET /api/unified/v1/sales/{id}/pdf` with an expired Conta Azul access token.
- Workaround: Refresh credentials through another JSON endpoint before downloading the PDF.
- Root cause: `ContaAzulProvider.getSalePdf()` throws `PDF_REFRESH_NEEDED`, and the route rethrows it instead of calling `refreshErpToken()` and retrying the binary request.

**Tiny provider is present but unreachable through the provider factory:**
- Symptoms: `TinyProvider` has a test and implementation file, but no unified route can resolve provider `TINY`.
- Files: `src/lib/providers/implementations/TinyProvider.ts`, `src/tests/mappers/tiny.test.ts`, `src/lib/providers/ProviderFactory.ts`
- Trigger: Create a linked account with provider `TINY` and call a unified endpoint.
- Workaround: Manually add a `TINY` case to `src/lib/providers/ProviderFactory.ts`.
- Root cause: Generated provider registration is manual and `ProviderFactory.ts` includes only `CONTA_AZUL` and `OMIE`.

**Bulk sales route naming and exported methods are inconsistent:**
- Symptoms: `src/app/api/unified/v1/sales/bulk/route.ts` exports both `DELETE` and `POST` for a handler named `bulkDeleteSalesHandler`, while `src/lib/openapi.ts` documents `/sales/bulk-delete`.
- Files: `src/app/api/unified/v1/sales/bulk/route.ts`, `src/lib/openapi.ts`, `src/lib/providers/IProvider.ts`
- Trigger: Consumer follows OpenAPI path or uses HTTP method semantics for bulk delete.
- Workaround: Call the implemented Next.js route path directly and accept either `POST` or `DELETE`.
- Root cause: Route path, OpenAPI path, and handler naming are not generated from a shared contract.

## Security Considerations

**Administrative dashboard has no authentication model:**
- Risk: If `src/middleware.ts` is removed to make the dashboard usable, pages and server actions expose client, API key, and linked account management without identity or authorization checks.
- Files: `src/middleware.ts`, `src/app/dashboard/clients/page.tsx`, `src/app/dashboard/linked-accounts/page.tsx`, `src/app/actions/client.ts`, `src/app/actions/linked-account.ts`, `src/app/actions/test-api.ts`
- Current mitigation: `src/middleware.ts` blocks all dashboard access, which also blocks legitimate use.
- Recommendations: Add real admin authentication/authorization in `src/middleware.ts` and verify authorization inside every server action before touching Prisma.

**API keys are stored and displayed in plaintext:**
- Risk: Database compromise or dashboard access reveals reusable Bearer tokens; the clients page renders the full key value.
- Files: `prisma/schema.prisma`, `src/app/actions/client.ts`, `src/lib/api-auth.ts`, `src/app/dashboard/clients/page.tsx`
- Current mitigation: Keys are generated with `crypto.randomBytes(16)` and the `ApiKey.key` column is unique.
- Recommendations: Store only a keyed hash of API keys, show the key only once on creation, add key prefixes for lookup, add rotation/revocation metadata, and stop rendering full keys in `src/app/dashboard/clients/page.tsx`.

**OAuth and ERP tokens are stored in plaintext:**
- Risk: Access tokens, refresh tokens, ERP client IDs, and ERP client secrets are persisted directly in database columns.
- Files: `prisma/schema.prisma`, `src/app/api/oauth/callback/conta-azul/route.ts`, `src/app/actions/linked-account.ts`, `src/lib/token-refresh.ts`
- Current mitigation: No application-level encryption is detected.
- Recommendations: Encrypt credential columns before persistence, isolate encryption keys in deployment secrets, redact credentials from logs, and avoid returning credential-bearing records from server actions.

**OAuth state is only a client ID:**
- Risk: The callback trusts `state` as `clientId`, with no nonce, signature, expiry, or session binding, making account-linking CSRF and client misbinding possible.
- Files: `src/app/actions/oauth.ts`, `src/app/api/oauth/callback/conta-azul/route.ts`
- Current mitigation: The callback checks that `code` and `state` exist.
- Recommendations: Store a signed one-time OAuth state record tied to an authenticated admin/session and expected `clientId`; reject expired, replayed, or tampered state values.

**Error responses can leak upstream provider details:**
- Risk: Several route handlers return `error.message` from provider exceptions, and request utilities include upstream response bodies in thrown errors.
- Files: `src/lib/unified-api-utils.ts`, `src/lib/omie-utils.ts`, `src/app/api/unified/v1/products/[id]/route.ts`, `src/app/api/unified/v1/customers/[id]/route.ts`, `src/app/api/unified/v1/customers/connected-account/route.ts`, `src/app/api/unified/v1/products/categories/route.ts`
- Current mitigation: Some top-level handlers use generic fallback text, but most pass raw messages through.
- Recommendations: Map provider errors to stable public error codes, log raw provider bodies server-side with redaction, and return sanitized messages from API routes.

**Unified responses include raw upstream payloads:**
- Risk: `remoteData.raw` may expose provider-specific PII, internal fields, or payload bloat to unified API consumers.
- Files: `src/lib/mappers/contaazul.ts`, `src/lib/mappers/omie-customers.ts`, `src/lib/validations/unified-schemas.ts`, `src/types/unified.ts`
- Current mitigation: Not detected.
- Recommendations: Hide raw provider payloads by default, expose them only behind an explicit debug/admin flag, and redact sensitive fields before inclusion.

**External callback URL uses a public environment variable fallback:**
- Risk: OAuth redirect construction accepts `NEXT_PUBLIC_APP_URL` and falls back to localhost, which can misroute production callbacks or expose configuration in client-accessible environments.
- Files: `src/app/actions/oauth.ts`, `src/app/api/oauth/callback/conta-azul/route.ts`
- Current mitigation: Server-side callback checks for Conta Azul credentials before exchanging tokens.
- Recommendations: Use a server-only canonical app URL for OAuth redirects and validate the redirect URI against configured allowed origins.

## Performance Bottlenecks

**No request timeout, retry backoff, or circuit breaker around upstream ERP calls:**
- Problem: `fetch()` calls can wait on upstream providers and tie up route handlers; only token-expiry retry exists for Conta Azul JSON requests.
- Files: `src/lib/unified-api-utils.ts`, `src/lib/omie-utils.ts`, `src/lib/providers/implementations/ContaAzulProvider.ts`, `src/lib/token-refresh.ts`
- Cause: Request helpers call `fetch()` directly without `AbortController`, rate-limit handling, backoff, or provider health controls.
- Improvement path: Add a shared provider HTTP client with timeouts, retry policy for safe operations, rate-limit handling, structured errors, and metrics.

**Repeated API-key lookup by plaintext key has no cache or prefix strategy:**
- Problem: Every unified request does a database lookup by full Bearer token.
- Files: `src/lib/api-auth.ts`, `prisma/schema.prisma`
- Cause: `withUnifiedAuth()` calls `prisma.apiKey.findUnique({ where: { key } })` for every request and keys are stored as direct lookup values.
- Improvement path: Use a prefix plus hash lookup, cache positive auth results briefly if deployment topology allows it, and add indexes/expiry filters that match the auth query.

**Dashboard list pages load all rows:**
- Problem: Client and linked-account dashboards fetch entire tables without pagination.
- Files: `src/app/dashboard/clients/page.tsx`, `src/app/dashboard/linked-accounts/page.tsx`
- Cause: `findMany()` calls include all clients/API keys or linked accounts and render a full table in one response.
- Improvement path: Add pagination, scoped queries, and column selection that avoids loading historical API keys or unnecessary relations.

**Provider response mapping can duplicate large raw payloads:**
- Problem: Mapper outputs include `remoteData.raw`, which duplicates provider records in every response.
- Files: `src/lib/mappers/contaazul.ts`, `src/lib/mappers/products.ts`, `src/lib/mappers/omie-customers.ts`, `src/types/unified.ts`
- Cause: Raw upstream objects are embedded alongside normalized fields.
- Improvement path: Remove raw payloads from default responses and add explicit debug serialization when needed.

## Fragile Areas

**Next.js route handler context is bypassed with casts:**
- Files: `src/lib/api-auth.ts`, `src/app/api/unified/v1/sales/[id]/route.ts`, `src/app/api/unified/v1/sales/[id]/pdf/route.ts`
- Why fragile: `withUnifiedAuth()` types variadic `...args` as `any[]`, and dynamic route handlers cast to `as any` to satisfy Next.js signatures.
- Common failures: Next.js version/type changes can break parameter passing silently or hide route context mistakes.
- Safe modification: Make `withUnifiedAuth()` generic over the route context type and add route-level tests for dynamic parameters.
- Test coverage: No route handler tests are present.

**Token refresh has race-condition risk:**
- Files: `src/lib/unified-api-utils.ts`, `src/lib/token-refresh.ts`, `prisma/schema.prisma`
- Why fragile: Multiple concurrent requests using an expired token can all call `refreshErpToken()` and update the same credential row.
- Common failures: A later refresh can overwrite a newer refresh token, causing future requests to fail.
- Safe modification: Add optimistic locking or transaction-based compare-and-swap around `OAuthCredential.updatedAt`/token versions.
- Test coverage: No token refresh concurrency tests are present.

**Provider capability gaps surface as 500s:**
- Files: `src/lib/providers/implementations/OmieProvider.ts`, `src/lib/providers/implementations/TinyProvider.ts`, `src/app/api/unified/v1/products/route.ts`, `src/app/api/unified/v1/sales/route.ts`, `src/app/api/unified/v1/sales/[id]/route.ts`
- Why fragile: Unsupported provider methods throw generic errors that API handlers translate to `500`.
- Common failures: Valid provider/account combinations return server errors for unsupported resources instead of deterministic `501`/`404` capability responses.
- Safe modification: Add provider capability metadata and map unsupported capabilities to `501 Not Implemented` before calling the provider.
- Test coverage: Only mapper tests and a Tiny instantiation smoke test exist.

**Input and path IDs are forwarded without normalization:**
- Files: `src/app/api/unified/v1/products/[id]/route.ts`, `src/app/api/unified/v1/customers/[id]/route.ts`, `src/app/api/unified/v1/customers/bulk/delete/route.ts`, `src/app/api/unified/v1/sales/bulk/route.ts`
- Why fragile: Raw route params and JSON bodies become upstream ERP path segments or payloads.
- Common failures: Provider-specific validation errors, accidental malformed requests, and inconsistent error shape across endpoints.
- Safe modification: Validate IDs, body schemas, array length limits, and allowed methods before constructing upstream paths.
- Test coverage: No API validation tests are present.

## Scaling Limits

**Database schema supports single-tenant admin workflows only:**
- Current capacity: No user, organization, role, audit log, or ownership model beyond `Client` and linked accounts.
- Files: `prisma/schema.prisma`, `src/app/actions/client.ts`, `src/app/actions/linked-account.ts`, `src/middleware.ts`
- Limit: Multi-admin or self-service tenants cannot be secured or isolated without schema changes.
- Symptoms at limit: Any authenticated admin model added later must retrofit ownership into existing `Client`, `ApiKey`, and `LinkedAccount` records.
- Scaling path: Add users/organizations/roles, explicit ownership foreign keys, and audit events before enabling dashboard access.

**Provider factory is a hardcoded switch:**
- Current capacity: Two registered providers in `src/lib/providers/ProviderFactory.ts`; generated `TinyProvider` is not registered.
- Files: `src/lib/providers/ProviderFactory.ts`, `scripts/generate-provider.ts`, `src/lib/providers/implementations/TinyProvider.ts`
- Limit: Every provider addition requires code changes and redeploys to the factory.
- Symptoms at limit: Provider catalogue growth increases merge conflicts and manual wiring mistakes.
- Scaling path: Use provider metadata registration files, dynamic imports, or a generated provider registry with tests.

**No provider-rate management or queued execution:**
- Current capacity: Requests are proxied synchronously through Next.js route handlers.
- Files: `src/lib/unified-api-utils.ts`, `src/lib/omie-utils.ts`, `src/app/api/unified/v1/*/route.ts`
- Limit: High-volume integrations or upstream rate limits can cause request failures and slow responses.
- Symptoms at limit: Provider throttling, exhausted route execution time, and inconsistent retries.
- Scaling path: Add rate-limit-aware clients, background job queues for bulk operations, and provider-specific quotas.

## Dependencies at Risk

**Next.js 16 API surface is project-specific and changing:**
- Risk: The repository instructions warn that this Next.js version has breaking changes and that `node_modules/next/dist/docs/` must be read before writing Next.js code.
- Impact: Route handler typing, middleware behavior, and App Router conventions are easy to implement incorrectly.
- Files: `AGENTS.md`, `package.json`, `src/app/api/unified/v1/sales/[id]/route.ts`, `src/middleware.ts`
- Migration plan: Keep Next.js changes small, consult installed Next.js docs before edits, and add route/middleware tests around framework-sensitive code.

**Prisma 5 is used while Prisma 6+ is current in many ecosystems:**
- Risk: Dependency age can affect Next.js/runtime compatibility and generated client behavior.
- Impact: Future upgrades may require schema/client generation and query API changes.
- Files: `package.json`, `prisma/schema.prisma`, `src/lib/prisma.ts`
- Migration plan: Plan a dedicated Prisma upgrade with migration generation, client regeneration, and auth/query regression tests.

**Dependencies are not installed in the current workspace:**
- Risk: `npm test -- --run` fails with `vitest: command not found`, and `npm run lint` fails with `eslint: command not found`.
- Impact: Automated verification cannot run in this checkout until dependencies are installed.
- Files: `package.json`, `package-lock.json`, `vitest.config.ts`
- Migration plan: Run `npm install` or ensure CI installs dependencies before tests/lint; document setup expectations for mapper/executor agents.

## Missing Critical Features

**API key lifecycle management is incomplete:**
- Problem: Keys can be generated but not revoked, rotated with expiry enforcement, named, or audited.
- Files: `prisma/schema.prisma`, `src/app/actions/client.ts`, `src/app/dashboard/clients/page.tsx`, `src/lib/api-auth.ts`
- Blocks: Safe production use of client credentials.
- Implementation complexity: Medium; requires schema changes, UI changes, and auth middleware updates.

**Provider capability discovery is missing:**
- Problem: The API exposes broad unified resources even when a provider supports only a subset.
- Files: `src/lib/providers/IProvider.ts`, `src/lib/providers/implementations/OmieProvider.ts`, `src/lib/providers/implementations/TinyProvider.ts`, `src/lib/openapi.ts`
- Blocks: Reliable client behavior against partially implemented providers.
- Implementation complexity: Medium; add capability metadata and condition OpenAPI/docs/runtime responses on provider capabilities.

**Audit logging is absent for sensitive actions:**
- Problem: API key generation, ERP account linking, token refresh, and bulk deletes leave no application audit trail.
- Files: `src/app/actions/client.ts`, `src/app/actions/linked-account.ts`, `src/lib/token-refresh.ts`, `src/app/api/unified/v1/customers/bulk/delete/route.ts`, `src/app/api/unified/v1/sales/bulk/route.ts`
- Blocks: Security review, incident response, and customer support for integration mutations.
- Implementation complexity: Medium; add audit event models and write events in server actions/routes.

**Runtime/CI coverage for routes is missing:**
- Problem: No tests exercise `withUnifiedAuth()`, route handlers, token refresh, OAuth callback, or provider error mapping.
- Files: `src/lib/api-auth.ts`, `src/app/api/oauth/callback/conta-azul/route.ts`, `src/app/api/unified/v1/*/route.ts`, `src/tests/mappers/customers.test.ts`, `src/tests/mappers/tiny.test.ts`
- Blocks: Safe refactors of the API layer and provider architecture.
- Implementation complexity: Medium; add unit tests with mocked Prisma/fetch and integration tests for representative route handlers.

## Test Coverage Gaps

**Authentication wrapper is untested:**
- What's not tested: Authorization header parsing, API key lookup, account-token ownership check, missing credential behavior, and error status mapping.
- Files: `src/lib/api-auth.ts`, `src/app/api/unified/v1/*/route.ts`
- Risk: Auth bypass, incorrect status codes, or broken route context injection can ship unnoticed.
- Priority: High
- Difficulty to test: Requires Prisma mocking or a test database fixture.

**OAuth flow is untested:**
- What's not tested: Auth URL generation, state handling, token exchange failure, linked-account upsert, credential update, and redirect behavior.
- Files: `src/app/actions/oauth.ts`, `src/app/api/oauth/callback/conta-azul/route.ts`
- Risk: Account-linking security bugs and callback regressions.
- Priority: High
- Difficulty to test: Requires mocked `fetch`, environment variables, and Prisma client.

**Provider request helpers are untested:**
- What's not tested: Conta Azul 401 refresh/retry path, Omie 200-with-fault handling, raw error redaction, timeout behavior, and PDF binary path.
- Files: `src/lib/unified-api-utils.ts`, `src/lib/omie-utils.ts`, `src/lib/token-refresh.ts`, `src/lib/providers/implementations/ContaAzulProvider.ts`
- Risk: Expired tokens, upstream errors, and binary downloads fail in production without regression protection.
- Priority: High
- Difficulty to test: Requires mocked `fetch` and concurrent refresh scenarios.

**Route/request validation is untested:**
- What's not tested: Invalid JSON, invalid IDs, bulk `ids` shape, unsupported provider capabilities, and documented OpenAPI methods.
- Files: `src/app/api/unified/v1/products/[id]/route.ts`, `src/app/api/unified/v1/customers/[id]/route.ts`, `src/app/api/unified/v1/customers/bulk/delete/route.ts`, `src/app/api/unified/v1/sales/bulk/route.ts`, `src/lib/openapi.ts`
- Risk: Runtime API behavior diverges from docs and leaks provider errors.
- Priority: High
- Difficulty to test: Requires route-handler harness and mocked provider factory.

**Mappers are only partially covered:**
- What's not tested: Product mappers, sales mappers, edge-case nulls, list pagination metadata, remote payload redaction, and provider-specific status mappings.
- Files: `src/lib/mappers/products.ts`, `src/lib/mappers/sales.ts`, `src/lib/mappers/contaazul.ts`, `src/lib/mappers/omie-customers.ts`, `src/tests/mappers/customers.test.ts`
- Risk: Upstream schema changes can produce invalid unified responses or incorrect data normalization.
- Priority: Medium
- Difficulty to test: Requires additional provider fixture payloads.

**Dashboard/server actions are untested:**
- What's not tested: `createClient()`, `generateApiKey()`, linked-account creation, copy/test API flows, and middleware dashboard access behavior.
- Files: `src/app/actions/client.ts`, `src/app/actions/linked-account.ts`, `src/app/actions/test-api.ts`, `src/middleware.ts`, `src/app/dashboard/clients/page.tsx`, `src/app/dashboard/linked-accounts/page.tsx`
- Risk: Dashboard remains blocked or exposes sensitive actions when unblocked.
- Priority: High
- Difficulty to test: Requires server action test strategy and authorization fixtures.

---

*Concerns audit: 2026-05-24*
*Update as issues are fixed or new ones discovered*
