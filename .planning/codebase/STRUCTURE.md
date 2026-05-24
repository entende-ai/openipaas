# Codebase Structure

**Analysis Date:** 2026-05-24

## Directory Layout

```
openipaas/
├── .opencode/          # Local opencode/GSD resources and codebase templates
├── .planning/          # GSD planning artifacts; codebase maps live in `.planning/codebase/`
├── graphify-out/       # Knowledge graph artifacts for codebase navigation
├── prisma/             # Prisma schema and database seed script
├── public/             # Static assets served by Next.js, including logos and SVGs
├── raw/                # Raw/source corpus inputs for graph/document workflows
├── scripts/            # Developer automation scripts
├── src/                # Application source code
│   ├── app/            # Next.js App Router pages, layouts, server actions, and API routes
│   ├── components/     # Shared React components and UI primitives
│   ├── lib/            # Server/client shared application logic, provider adapters, mappers, Prisma
│   ├── middleware.ts   # Next.js middleware for dashboard route handling
│   ├── tests/          # Vitest tests and JSON fixtures
│   └── types/          # TypeScript domain/provider type definitions
├── Dockerfile          # Container build definition
├── docker-compose.yml  # Local PostgreSQL/development services
├── docker-entrypoint.sh # Container startup bootstrap
├── next.config.ts      # Next.js configuration
├── package.json        # npm scripts and dependencies
├── tsconfig.json       # TypeScript compiler and `@/*` alias configuration
└── vitest.config.ts    # Vitest test runner configuration
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js App Router tree for UI routes, server actions, and API endpoints.
- Contains: `layout.tsx`, `page.tsx`, nested route directories, `route.ts` API handlers, `actions/*.ts`, and route-local client components.
- Key files: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/docs/page.tsx`, `src/app/globals.css`.
- Subdirectories: `src/app/actions/` for server actions, `src/app/api/` for API routes, `src/app/dashboard/` for admin UI, `src/app/docs/` for API docs page.

**`src/app/api/`:**
- Purpose: HTTP API surface implemented with App Router route handlers.
- Contains: OAuth callback route and unified API route tree.
- Key files: `src/app/api/oauth/callback/conta-azul/route.ts`, `src/app/api/unified/v1/customers/route.ts`, `src/app/api/unified/v1/products/route.ts`, `src/app/api/unified/v1/sales/route.ts`.
- Subdirectories: `src/app/api/oauth/` for provider OAuth callbacks; `src/app/api/unified/v1/` for versioned unified API resources.

**`src/app/api/unified/v1/`:**
- Purpose: Versioned public unified API resources.
- Contains: Resource directories for customers, products, and sales.
- Key files: `src/app/api/unified/v1/customers/route.ts`, `src/app/api/unified/v1/products/route.ts`, `src/app/api/unified/v1/sales/route.ts`.
- Subdirectories: `customers/` includes `[id]`, `legacy/[id]`, `bulk/*`, and `connected-account`; `products/` includes `[id]`, categories, brands, units, ncm, cest; `sales/` includes `[id]`, `[id]/pdf`, `sellers`, and `bulk`.

**`src/app/actions/`:**
- Purpose: Server actions used by dashboard client components.
- Contains: `"use server"` mutation functions.
- Key files: `src/app/actions/client.ts`, `src/app/actions/linked-account.ts`, `src/app/actions/oauth.ts`, `src/app/actions/test-api.ts`.
- Subdirectories: None.

**`src/app/dashboard/`:**
- Purpose: Internal admin dashboard route tree.
- Contains: Dashboard layout, server-rendered pages, route-local interactive components.
- Key files: `src/app/dashboard/layout.tsx`, `src/app/dashboard/clients/page.tsx`, `src/app/dashboard/linked-accounts/page.tsx`, `src/app/dashboard/logs/page.tsx`.
- Subdirectories: `clients/components/` for client/key dialogs and buttons; `linked-accounts/components/` for ERP account dialogs, copy button, and test API dialog.

**`src/components/`:**
- Purpose: Shared React components usable across App Router pages.
- Contains: Layout components, theme provider, and UI primitive wrappers.
- Key files: `src/components/Sidebar.tsx`, `src/components/theme-provider.tsx`, `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/table.tsx`.
- Subdirectories: `src/components/ui/` for reusable component primitives.

**`src/lib/`:**
- Purpose: Core application logic outside route/UI files.
- Contains: Auth wrapper, Prisma singleton, provider adapters, request utilities, mappers, validation schemas, OpenAPI spec, styling helper.
- Key files: `src/lib/api-auth.ts`, `src/lib/prisma.ts`, `src/lib/openapi.ts`, `src/lib/unified-api-utils.ts`, `src/lib/token-refresh.ts`, `src/lib/omie-utils.ts`, `src/lib/utils.ts`.
- Subdirectories: `mappers/`, `providers/`, and `validations/`.

**`src/lib/providers/`:**
- Purpose: Provider plugin/adapter system for external ERPs.
- Contains: `IUnifiedProvider` interface, factory, and concrete provider implementations.
- Key files: `src/lib/providers/IProvider.ts`, `src/lib/providers/ProviderFactory.ts`, `src/lib/providers/implementations/ContaAzulProvider.ts`, `src/lib/providers/implementations/OmieProvider.ts`, `src/lib/providers/implementations/TinyProvider.ts`.
- Subdirectories: `implementations/` for provider classes.

**`src/lib/mappers/`:**
- Purpose: Convert provider-specific objects to unified public API objects.
- Contains: Customer, product, sale, and provider-specific mapper modules.
- Key files: `src/lib/mappers/contaazul.ts`, `src/lib/mappers/omie-customers.ts`, `src/lib/mappers/products.ts`, `src/lib/mappers/sales.ts`.
- Subdirectories: None.

**`src/lib/validations/`:**
- Purpose: Runtime schemas for unified data models.
- Contains: Zod schemas matching `src/types/unified.ts`.
- Key files: `src/lib/validations/unified-schemas.ts`.
- Subdirectories: None.

**`src/types/`:**
- Purpose: TypeScript type definitions for canonical and provider-specific data shapes.
- Contains: Unified interfaces and provider payload type modules.
- Key files: `src/types/unified.ts`, `src/types/contaazul.ts`, `src/types/contaazul_products.ts`, `src/types/contaazul_sales.ts`.
- Subdirectories: None.

**`src/tests/`:**
- Purpose: Test coverage and fixtures for mapper/provider behavior.
- Contains: Vitest test files and JSON mock payloads.
- Key files: `src/tests/mappers/customers.test.ts`, `src/tests/mappers/tiny.test.ts`, `src/tests/mocks/contaazul-customer.json`, `src/tests/mocks/omie-customer.json`.
- Subdirectories: `mappers/` for mapper/provider tests; `mocks/` for provider payload fixtures.

**`prisma/`:**
- Purpose: Database schema and seed data.
- Contains: Prisma schema and TypeScript seed script.
- Key files: `prisma/schema.prisma`, `prisma/seed.ts`.
- Subdirectories: None detected.

**`scripts/`:**
- Purpose: Developer automation outside the Next.js runtime.
- Contains: TypeScript and JavaScript scripts.
- Key files: `scripts/generate-provider.ts`, `scripts/download-logos.js`.
- Subdirectories: None detected.

**`public/`:**
- Purpose: Static assets served from the web root.
- Contains: Core SVG/PNG assets and SaaS logo images.
- Key files: `public/logo.png`, `public/logo.svg`, `public/favicon.ico`, `public/logos/contaazul.com.png`, `public/logos/omie.com.br.png`.
- Subdirectories: `public/logos/` for provider/service logo PNGs.

**`.planning/`:**
- Purpose: GSD planning and codebase documentation.
- Contains: Generated planning artifacts.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.
- Subdirectories: `.planning/codebase/` for codebase maps.

**`graphify-out/`:**
- Purpose: Persistent knowledge graph for codebase relationships and navigation.
- Contains: Graph JSON, reports, and visualization artifacts.
- Key files: `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md` when present.
- Subdirectories: Tool-managed; do not place application source here.

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root App Router layout and metadata.
- `src/app/page.tsx`: Landing page at `/`.
- `src/app/docs/page.tsx`: Interactive API documentation at `/docs`.
- `src/middleware.ts`: Dashboard request middleware matching `/dashboard/:path*`.
- `src/app/api/unified/v1/customers/route.ts`: Unified customers collection API.
- `src/app/api/unified/v1/products/route.ts`: Unified products collection API.
- `src/app/api/unified/v1/sales/route.ts`: Unified sales collection API.
- `src/app/api/oauth/callback/conta-azul/route.ts`: Conta Azul OAuth callback.
- `scripts/generate-provider.ts`: Provider scaffold CLI script.
- `prisma/seed.ts`: Prisma seed entry point.
- `docker-entrypoint.sh`: Container runtime entrypoint.

**Configuration:**
- `package.json`: Scripts, dependencies, Prisma seed command, and package metadata.
- `package-lock.json`: npm dependency lockfile.
- `next.config.ts`: Next.js standalone output and allowed dev origin configuration.
- `tsconfig.json`: TypeScript strict mode and `@/*` path alias to `src/*`.
- `eslint.config.mjs`: ESLint configuration.
- `postcss.config.mjs`: PostCSS/Tailwind pipeline configuration.
- `components.json`: shadcn/base UI component configuration.
- `vitest.config.ts`: Vitest test configuration.
- `docker-compose.yml`: Local Docker services; note existence only when inspecting secrets.
- `Dockerfile`: Container image build.

**Core Logic:**
- `src/lib/api-auth.ts`: Unified API authentication and `UnifiedAuthContext` injection.
- `src/lib/prisma.ts`: Prisma client singleton.
- `src/lib/providers/IProvider.ts`: Provider adapter interface.
- `src/lib/providers/ProviderFactory.ts`: Provider selection registry.
- `src/lib/providers/implementations/ContaAzulProvider.ts`: Conta Azul provider adapter.
- `src/lib/providers/implementations/OmieProvider.ts`: Omie provider adapter.
- `src/lib/unified-api-utils.ts`: Conta Azul request helper with token-refresh retry.
- `src/lib/token-refresh.ts`: ERP token refresh and credential update logic.
- `src/lib/omie-utils.ts`: Omie JSON-RPC request helper.
- `src/lib/mappers/contaazul.ts`: Conta Azul customer mapper.
- `src/lib/mappers/omie-customers.ts`: Omie customer mapper.
- `src/lib/mappers/products.ts`: Product/category/brand/unit/NCM/CEST mappers.
- `src/lib/mappers/sales.ts`: Sales/seller mappers.
- `src/types/unified.ts`: Canonical public API model definitions.
- `src/lib/openapi.ts`: OpenAPI specification rendered by `/docs`.

**Testing:**
- `src/tests/mappers/customers.test.ts`: Customer mapper tests with Conta Azul and Omie fixtures.
- `src/tests/mappers/tiny.test.ts`: Generated Tiny provider instantiation test.
- `src/tests/mocks/contaazul-customer.json`: Conta Azul customer fixture.
- `src/tests/mocks/omie-customer.json`: Omie customer fixture.
- `vitest.config.ts`: Test runner configuration.

**Documentation:**
- `README.md`: Project README.
- `AGENTS.md`: Agent instructions for this repository.
- `CLAUDE.md`: Claude-facing project guidance.
- `.planning/codebase/ARCHITECTURE.md`: Conceptual architecture map.
- `.planning/codebase/STRUCTURE.md`: Physical structure map.
- `src/lib/openapi.ts`: User-facing API documentation source.

**Database:**
- `prisma/schema.prisma`: PostgreSQL schema for `Client`, `ApiKey`, `LinkedAccount`, and `OAuthCredential`.
- `prisma/seed.ts`: Development seed data for local clients, API keys, and linked accounts.

## Naming Conventions

**Files:**
- App Router route handlers use `route.ts`: `src/app/api/unified/v1/customers/route.ts`.
- App Router pages use `page.tsx`: `src/app/page.tsx`, `src/app/docs/page.tsx`, `src/app/dashboard/clients/page.tsx`.
- App Router layouts use `layout.tsx`: `src/app/layout.tsx`, `src/app/dashboard/layout.tsx`.
- Dynamic route directories use bracket names: `src/app/api/unified/v1/customers/[id]/route.ts`, `src/app/api/unified/v1/sales/[id]/pdf/route.ts`.
- React component files use PascalCase for custom/local components: `src/components/Sidebar.tsx`, `src/app/dashboard/clients/components/CreateClientDialog.tsx`, `src/app/dashboard/linked-accounts/components/TestApiDialog.tsx`.
- UI primitive files use kebab-case/lowercase: `src/components/ui/floating-icons-hero-section.tsx`, `src/components/ui/dotted-surface.tsx`, `src/components/ui/button.tsx`.
- Provider classes use PascalCase plus `Provider.ts`: `src/lib/providers/implementations/ContaAzulProvider.ts`, `src/lib/providers/implementations/OmieProvider.ts`, `src/lib/providers/implementations/TinyProvider.ts`.
- Mapper modules use lowercase or kebab-case by domain/provider: `src/lib/mappers/contaazul.ts`, `src/lib/mappers/omie-customers.ts`, `src/lib/mappers/products.ts`, `src/lib/mappers/sales.ts`.
- Type modules use domain names and underscores for generated/provider groupings: `src/types/unified.ts`, `src/types/contaazul_products.ts`, `src/types/contaazul_sales.ts`.
- Test files use `*.test.ts`: `src/tests/mappers/customers.test.ts`, `src/tests/mappers/tiny.test.ts`.

**Directories:**
- App routes use URL segment directory names: `src/app/api/unified/v1/products/categories/`, `src/app/api/unified/v1/customers/bulk/delete/`.
- Route-local components live in a `components/` subdirectory beside their page: `src/app/dashboard/clients/components/`.
- Shared UI primitives live under `src/components/ui/`.
- Provider implementations live under `src/lib/providers/implementations/`.
- Tests are grouped by concern under `src/tests/mappers/` and fixtures under `src/tests/mocks/`.

**Special Patterns:**
- `@/*` imports map to `src/*` via `tsconfig.json`; use `@/lib/api-auth` instead of deep relative paths when crossing directories.
- `"use client"` marks browser-interactive components/pages such as `src/app/page.tsx`, `src/app/docs/page.tsx`, and dashboard dialog components.
- `"use server"` marks server actions in `src/app/actions/*.ts`.
- `ProviderFactory.getProvider(...)` is the current provider registry; every usable provider must be registered in `src/lib/providers/ProviderFactory.ts`.
- `withUnifiedAuth(handler)` is the standard wrapper for authenticated unified API handlers.
- `remoteData` on unified types preserves raw provider payloads; mapper functions should set it when returning provider-derived records.

## Where to Add New Code

**New Unified API Resource:**
- Route definition: `src/app/api/unified/v1/{resource}/route.ts`.
- Item route: `src/app/api/unified/v1/{resource}/[id]/route.ts`.
- Auth wrapper: Use `withUnifiedAuth` from `src/lib/api-auth.ts`.
- Provider contract: Add methods to `src/lib/providers/IProvider.ts` if the operation belongs in all providers.
- Provider implementation: Add methods to `src/lib/providers/implementations/{Provider}Provider.ts`.
- Types: Add canonical interfaces to `src/types/unified.ts`.
- Validation: Add Zod schemas to `src/lib/validations/unified-schemas.ts`.
- Documentation: Add OpenAPI paths/schemas to `src/lib/openapi.ts`.
- Tests: Add mapper/provider tests under `src/tests/mappers/` and fixtures under `src/tests/mocks/`.

**New Provider:**
- Scaffold: Run `npm run generate-provider <name>` from `package.json`.
- Implementation: `src/lib/providers/implementations/{Name}Provider.ts`.
- Registry: Add provider branch to `src/lib/providers/ProviderFactory.ts`.
- Request helper: Add provider-specific request utility in `src/lib/{provider}-utils.ts` if external API mechanics differ.
- Mappers: Add provider mappers under `src/lib/mappers/{provider}.ts` or domain-specific mapper files.
- Types: Add provider payload types under `src/types/{provider}.ts` or `src/types/{provider}_{domain}.ts`.
- Tests: Add tests under `src/tests/mappers/{provider}.test.ts` and fixtures under `src/tests/mocks/`.
- Static assets: Add provider logo under `public/logos/` if used in UI.

**New Dashboard Page:**
- Route page: `src/app/dashboard/{feature}/page.tsx`.
- Route-local components: `src/app/dashboard/{feature}/components/`.
- Mutations: `src/app/actions/{feature}.ts` with `"use server"`.
- Shared layout/navigation: Update `src/components/Sidebar.tsx` and optionally `src/app/dashboard/layout.tsx`.
- Database reads: Use `src/lib/prisma.ts` from server components/actions only.

**New Shared UI Component:**
- Reusable primitive: `src/components/ui/{component}.tsx`.
- App-specific shared component: `src/components/{ComponentName}.tsx`.
- Styling helper: Use `cn` from `src/lib/utils.ts`.
- Route-specific component: Keep it beside the route under `src/app/{route}/components/` if it is not reused elsewhere.

**New Mapper:**
- Implementation: `src/lib/mappers/{domain-or-provider}.ts`.
- Input types: `src/types/{provider}.ts` or `src/types/{provider}_{domain}.ts`.
- Output types: `src/types/unified.ts`.
- Runtime schemas: `src/lib/validations/unified-schemas.ts`.
- Tests: `src/tests/mappers/{domain-or-provider}.test.ts`.

**New Database Model:**
- Schema: `prisma/schema.prisma`.
- Seed data: `prisma/seed.ts` when local defaults are useful.
- Access: `src/lib/prisma.ts` from server-only modules.
- Dashboard management: `src/app/dashboard/{model}/page.tsx` and `src/app/actions/{model}.ts`.

**New Utility:**
- Shared app utility: `src/lib/{utility}.ts`.
- External provider request helper: `src/lib/{provider}-utils.ts`.
- Styling/class utility: Extend `src/lib/utils.ts`.
- Developer CLI script: `scripts/{task}.ts` or `scripts/{task}.js`.

## Special Directories

**`src/app/`:**
- Purpose: Next.js App Router source with file-system routing semantics.
- Source: Authored application code.
- Committed: Yes.

**`src/app/api/unified/v1/`:**
- Purpose: Versioned public unified API.
- Source: Authored route handlers.
- Committed: Yes.

**`src/lib/providers/implementations/`:**
- Purpose: Provider plugin classes.
- Source: Authored or generated by `scripts/generate-provider.ts`.
- Committed: Yes.

**`src/tests/mocks/`:**
- Purpose: Provider payload fixtures for tests.
- Source: Authored test data.
- Committed: Yes.

**`prisma/`:**
- Purpose: Prisma schema and seed source of truth.
- Source: Authored schema/scripts; Prisma generated client is not stored here.
- Committed: Yes.

**`public/`:**
- Purpose: Static web assets served by Next.js.
- Source: Authored/downloaded assets, including `scripts/download-logos.js` output.
- Committed: Yes.

**`.planning/`:**
- Purpose: GSD planning artifacts and generated codebase maps.
- Source: Tool-generated and agent-authored planning documents.
- Committed: Project-dependent; treat `.planning/codebase/` as the current codebase map location.

**`graphify-out/`:**
- Purpose: Knowledge graph outputs used by graphify workflows.
- Source: Generated by graphify.
- Committed: Project-dependent; do not add application code here.

**`.next/`:**
- Purpose: Next.js build/dev output when present.
- Source: Generated by Next.js.
- Committed: No.

**`node_modules/`:**
- Purpose: npm dependencies when installed.
- Source: Generated by npm install.
- Committed: No.

---

*Structure analysis: 2026-05-24*
*Update when directory structure changes*
