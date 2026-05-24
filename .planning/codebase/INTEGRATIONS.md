# External Integrations

**Analysis Date:** 2026-05-24

## APIs & External Services

**ERP Providers:**
- Conta Azul - Primary implemented upstream ERP integration for customers, products, sellers, sales, sale details, sale PDFs, and bulk sale deletion.
  - Integration method: REST API via native `fetch` in `src/lib/unified-api-utils.ts`, `src/lib/token-refresh.ts`, `src/app/api/oauth/callback/conta-azul/route.ts`, and `src/lib/providers/implementations/ContaAzulProvider.ts`.
  - Base URLs: `https://api-v2.contaazul.com/v1` in `src/lib/unified-api-utils.ts` and `https://auth.contaazul.com` in `src/app/actions/oauth.ts`, `src/app/api/oauth/callback/conta-azul/route.ts`, and `src/lib/token-refresh.ts`.
  - Auth: OAuth2 authorization code and refresh-token flow using `CONTA_AZUL_CLIENT_ID`, `NEXT_PUBLIC_CONTA_AZUL_CLIENT_ID`, `CONTA_AZUL_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`, and `APP_URL` environment variables.
  - Request auth: Bearer access token stored through `OAuthCredential.accessToken` in `prisma/schema.prisma`; refresh token stored through `OAuthCredential.refreshToken`.
  - Endpoints used: `/pessoas`, `/produtos`, `/v1/venda/busca`, `/v1/venda/vendedores`, `/v1/venda/{id}`, `/v1/venda/{id}/itens`, `/v1/venda/{id}/imprimir`, and `/v1/venda/exclusao-lote` in `src/lib/providers/implementations/ContaAzulProvider.ts`.
- Omie - Partially implemented upstream ERP integration for customer listing.
  - Integration method: JSON-RPC-style POST requests via native `fetch` in `src/lib/omie-utils.ts` and provider calls in `src/lib/providers/implementations/OmieProvider.ts`.
  - Base URL: `https://app.omie.com.br/api/v1` in `src/lib/omie-utils.ts`.
  - Auth: Omie app key and app secret are read from stored `OAuthCredential.accessToken` and `OAuthCredential.refreshToken` in `src/lib/providers/implementations/OmieProvider.ts`.
  - Endpoints used: `/geral/clientes/` with call `ListarClientes` in `src/lib/providers/implementations/OmieProvider.ts`.
- Tiny - Stub provider only.
  - Integration method: Not connected to an external API; `src/lib/providers/implementations/TinyProvider.ts` returns empty results or throws unimplemented errors.
  - Auth: Not implemented.
  - Factory registration: Not registered in `src/lib/providers/ProviderFactory.ts`.

**Internal Unified API:**
- Unified REST API - The product exposes normalized B2B endpoints under `src/app/api/unified/v1/**`.
  - Integration method: Next.js route handlers with `withUnifiedAuth` in `src/lib/api-auth.ts` and provider dispatch through `src/lib/providers/ProviderFactory.ts`.
  - Auth: HTTP `Authorization: Bearer <api key>` plus `X-Account-Token` header, both documented in `src/lib/openapi.ts` and validated in `src/lib/api-auth.ts`.
  - Documented resources: Customers, products, sales, sellers, categories, brands, units, NCM, CEST, bulk actions, connected account, and PDF retrieval under `src/app/api/unified/v1/**`.

**API Documentation:**
- Scalar API Reference - Interactive OpenAPI documentation for the unified API.
  - SDK/Client: `@scalar/api-reference-react` in `src/app/docs/page.tsx`.
  - Spec source: `src/lib/openapi.ts`.
  - Auth model: OpenAPI security schemes for bearer API key and `X-Account-Token` header in `src/lib/openapi.ts`.

**Analytics:**
- Vercel Analytics - Page/runtime analytics component.
  - SDK/Client: `@vercel/analytics/next` imported in `src/app/layout.tsx`.
  - Auth: Managed by Vercel/runtime environment; no analytics secret is referenced in source.

## Data Storage

**Databases:**
- PostgreSQL - Primary persistence for clients, API keys, linked ERP accounts, and OAuth credentials.
  - Connection: `DATABASE_URL` env var referenced by `prisma/schema.prisma`.
  - Client: Prisma Client via `@prisma/client` and singleton wrapper in `src/lib/prisma.ts`.
  - Schema: `Client`, `ApiKey`, `LinkedAccount`, and `OAuthCredential` models in `prisma/schema.prisma`.
  - Seed data: Development-only seed workflow in `prisma/seed.ts`; do not treat seed credentials as production secrets.
  - Local service: PostgreSQL 15 service defined in `docker-compose.yml`.

**File Storage:**
- Local static assets only - Public assets are served from `public/` and copied into the standalone Docker image by `Dockerfile`.
- No external object storage SDK or bucket integration is detected in `package.json`, `src/`, or `prisma/schema.prisma`.

**Caching:**
- None detected - No Redis/Memcached client dependency in `package.json` and no cache service in `docker-compose.yml`.
- Runtime token reuse is persisted in PostgreSQL through `OAuthCredential` in `prisma/schema.prisma`, not a cache layer.

## Authentication & Identity

**Application API Auth:**
- Custom API-key and account-token authentication.
  - Implementation: `withUnifiedAuth` middleware wrapper in `src/lib/api-auth.ts` validates a bearer API key against `ApiKey.key` and an `X-Account-Token` against `LinkedAccount.accountToken`.
  - Token storage: API keys, account tokens, access tokens, refresh tokens, ERP client IDs, and ERP client secrets are stored in PostgreSQL models defined in `prisma/schema.prisma`.
  - Session management: No end-user session provider is detected; dashboard actions access the database directly through server actions in `src/app/actions/*.ts`.

**OAuth Integrations:**
- Conta Azul OAuth - Connects a client to Conta Azul.
  - Authorization URL: Built in `src/app/actions/oauth.ts` with redirect to `/api/oauth/callback/conta-azul`.
  - Callback handler: `src/app/api/oauth/callback/conta-azul/route.ts` exchanges authorization codes for tokens and stores credentials.
  - Token refresh: `src/lib/token-refresh.ts` refreshes expired Conta Azul access tokens and updates `OAuthCredential`.
  - Credentials: `CONTA_AZUL_CLIENT_ID`, `NEXT_PUBLIC_CONTA_AZUL_CLIENT_ID`, and `CONTA_AZUL_CLIENT_SECRET`.
  - Scopes: `openid`, `profile`, and `aws.cognito.signin.user.admin` are requested in `src/app/actions/oauth.ts`.
- Omie credential model - Uses app key/app secret supplied/stored through linked account credentials.
  - Implementation: `src/app/actions/linked-account.ts` accepts ERP credentials and `src/lib/providers/implementations/OmieProvider.ts` maps them to Omie request auth.
  - Credentials: Stored in `OAuthCredential.accessToken` and `OAuthCredential.refreshToken` fields from `prisma/schema.prisma`.

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry, Datadog, LogRocket, or similar error tracking package is present in `package.json`.

**Analytics:**
- Vercel Analytics - Enabled globally by `<Analytics />` in `src/app/layout.tsx`.

**Logs:**
- Console/stdout logging - API auth errors, upstream ERP raw errors, token refresh flow, OAuth debugging, test API errors, and seed progress use `console.log` / `console.error` in `src/lib/api-auth.ts`, `src/lib/unified-api-utils.ts`, `src/lib/omie-utils.ts`, `src/lib/token-refresh.ts`, `src/app/api/oauth/callback/conta-azul/route.ts`, `src/app/actions/test-api.ts`, and `prisma/seed.ts`.
- Hosting log aggregation: Not configured in repository; Docker and Next.js stdout/stderr are the observable outputs.

## CI/CD & Deployment

**Hosting:**
- Docker container - Production-like deployment is supported by `Dockerfile`, using Node 20 Alpine, Prisma generation, Next build, standalone output, and port 3000.
  - Deployment: Build image from `Dockerfile` and provide environment variables externally.
  - Environment vars: Configure `DATABASE_URL`, app URL variables, and provider credentials in the deployment environment.
- Docker Compose - Local development orchestration for web and PostgreSQL in `docker-compose.yml`.
  - Deployment: `docker-compose up --build` is documented in `README.md` for local startup.
  - Environment vars: Compose provides local development values; do not use development credentials in production.
- Vercel-compatible runtime - `@vercel/analytics` in `src/app/layout.tsx` and standalone Next.js output are compatible with Vercel-style deployments, but no `vercel.json` is detected.

**CI Pipeline:**
- None detected - No workflow files exist under `.github/workflows/`.
- Verification commands available: `npm run lint`, `npm run test`, and `npm run build` in `package.json`.

## Environment Configuration

**Development:**
- Required env vars: `DATABASE_URL`; `NEXT_PUBLIC_APP_URL` or `APP_URL` for OAuth and internal test API URLs; `CONTA_AZUL_CLIENT_ID` or `NEXT_PUBLIC_CONTA_AZUL_CLIENT_ID` plus `CONTA_AZUL_CLIENT_SECRET` for Conta Azul OAuth.
- Optional/env-specific vars: `NEXT_PUBLIC_API_URL` for the web container in `docker-compose.yml`.
- Secrets location: External environment, local shell, Docker Compose environment, or deployment platform settings; no root `.env` or `.env.example` is present.
- Mock/stub services: `prisma/seed.ts` creates development records and mock provider credentials for local testing; `src/lib/providers/implementations/TinyProvider.ts` is a stub provider.

**Staging:**
- Not detected - No staging-specific config file, compose override, or deployment workflow is present.
- Use separate PostgreSQL and provider OAuth credentials if staging is added.

**Production:**
- Secrets management: External to repository; configure deployment environment variables for `DATABASE_URL`, app URL, and provider credentials.
- Database: PostgreSQL database required by `prisma/schema.prisma`; backup/replication policy is not defined in repository.
- Failover/redundancy: Not detected.

## Webhooks & Callbacks

**Incoming:**
- Conta Azul OAuth callback - `GET /api/oauth/callback/conta-azul` implemented by `src/app/api/oauth/callback/conta-azul/route.ts`.
  - Verification: Validates presence of OAuth `code` and `state`; exchanges the code using Basic Auth with configured Conta Azul client credentials.
  - Events: OAuth authorization-code redirect only; not a webhook event stream.
- Unified API callbacks/webhooks - None detected under `src/app/api/**`.

**Outgoing:**
- Conta Azul OAuth token exchange - `src/app/api/oauth/callback/conta-azul/route.ts` sends a POST to `https://auth.contaazul.com/oauth2/token`.
- Conta Azul token refresh - `src/lib/token-refresh.ts` sends a POST to `https://auth.contaazul.com/oauth2/token` for refresh-token grants.
- Conta Azul REST API calls - `src/lib/unified-api-utils.ts` and `src/lib/providers/implementations/ContaAzulProvider.ts` call `https://api-v2.contaazul.com/v1` endpoints.
- Omie JSON-RPC API calls - `src/lib/omie-utils.ts` calls `https://app.omie.com.br/api/v1` endpoints.
- Internal self-test call - `src/app/actions/test-api.ts` calls the app's own `/api/unified/v1/customers` endpoint using the configured app URL.
- Retry logic: Conta Azul JSON API requests retry once after refreshing tokens in `src/lib/unified-api-utils.ts`; Omie calls have no retry wrapper in `src/lib/omie-utils.ts`.

---

*Integration audit: 2026-05-24*
*Update when adding/removing external services*
