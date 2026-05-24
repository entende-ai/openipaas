# Technology Stack

**Analysis Date:** 2026-05-24

## Languages

**Primary:**
- TypeScript 5.x - Application code, Next.js App Router pages/routes/actions, provider adapters, Prisma seed scripts, and tests under `src/`, `prisma/seed.ts`, `scripts/`, and `*.config.ts`.
- TSX / React 19.2.4 - UI components and pages under `src/app/**/*.tsx` and `src/components/**/*.tsx`.

**Secondary:**
- JavaScript / ECMAScript modules - Tooling config in `eslint.config.mjs` and `postcss.config.mjs`; package is configured with ESM via `package.json`.
- Prisma Schema - PostgreSQL data model in `prisma/schema.prisma`.
- CSS - Global styling in `src/app/globals.css` with Tailwind CSS v4 via `postcss.config.mjs`.
- Dockerfile / Compose YAML - Containerized app and local database setup in `Dockerfile` and `docker-compose.yml`.

## Runtime

**Environment:**
- Node.js 20 - Production container base image is `node:20-alpine` in `Dockerfile`; `@types/node` is pinned to Node 20 types in `package.json`.
- Browser runtime - React client components run in the browser for dashboard dialogs, docs, theme handling, animation, and Three.js UI effects in `src/app/**` and `src/components/**`.
- PostgreSQL 15 - Local database service is defined in `docker-compose.yml`; Prisma datasource in `prisma/schema.prisma` targets PostgreSQL.
- Next.js standalone server - `next.config.ts` sets `output: 'standalone'`, and `Dockerfile` copies `.next/standalone` into the runtime image.

**Package Manager:**
- npm - Scripts are defined in `package.json`; lockfile version 3 in `package-lock.json` indicates npm's current lockfile format.
- Lockfile: `package-lock.json` present.

## Frameworks

**Core:**
- Next.js 16.2.4 - Full-stack web framework for App Router pages, API route handlers, middleware, server actions, and production serving; configured in `next.config.ts` and used throughout `src/app/`.
- React 19.2.4 / React DOM 19.2.4 - UI runtime for pages and components in `src/app/` and `src/components/`.
- Prisma 5.22.0 / `@prisma/client` 5.22.0 - ORM and generated client for PostgreSQL access; schema lives in `prisma/schema.prisma`, shared singleton in `src/lib/prisma.ts`, migrations/seeding run through `package.json` scripts.
- Tailwind CSS 4 - Styling pipeline through `@tailwindcss/postcss` in `postcss.config.mjs`; class merging utilities use `tailwind-merge` and `clsx`.

**Testing:**
- Vitest 4.1.5 - Unit test runner configured in `vitest.config.ts`, with test files under `src/tests/**/*.test.ts`.
- `@vitest/ui` 4.1.5 - Optional Vitest browser UI dependency listed in `package.json`.

**Build/Dev:**
- TypeScript 5.x - Strict type checking and bundler module resolution configured in `tsconfig.json`.
- ESLint 9 + `eslint-config-next` 16.2.4 - Linting via `npm run lint`, configured in `eslint.config.mjs` with Next core web vitals and TypeScript rules.
- Next.js build - `npm run build` runs `prisma generate && next build` from `package.json`.
- tsx 4.21.0 - Executes TypeScript scripts, including Prisma seed in `prisma/seed.ts` and provider generation in `scripts/generate-provider.ts`.
- Docker / Docker Compose - Local and production-like container workflows use `Dockerfile`, `docker-compose.yml`, and `docker-entrypoint.sh`.
- Lightning CSS 1.32.0 - CSS processing dependency listed in `package.json`.

## Key Dependencies

**Critical:**
- `next` 16.2.4 - Defines the web/server framework, API route behavior, server actions, and build/deploy model in `src/app/`.
- `react` 19.2.4 and `react-dom` 19.2.4 - Required for all UI and client components in `src/app/**/*.tsx` and `src/components/**/*.tsx`.
- `@prisma/client` 5.22.0 and `prisma` 5.22.0 - Database model/client generation, data access, and seed workflow in `prisma/schema.prisma`, `src/lib/prisma.ts`, and `prisma/seed.ts`.
- `zod` 4.4.2 - Runtime validation for unified schemas in `src/lib/validations/unified-schemas.ts`.
- `@scalar/api-reference-react` 0.9.32 - Interactive OpenAPI documentation renderer in `src/app/docs/page.tsx`, backed by `src/lib/openapi.ts`.
- `@vercel/analytics` 2.0.1 - Vercel Analytics component mounted in `src/app/layout.tsx`.

**Infrastructure:**
- `tailwindcss` 4.x and `@tailwindcss/postcss` 4.x - CSS utility framework and PostCSS plugin configured in `postcss.config.mjs`.
- `class-variance-authority`, `clsx`, and `tailwind-merge` - Component class composition utilities used by UI primitives such as `src/components/ui/button.tsx` and `src/lib/utils.ts`.
- `@base-ui/react`, `@radix-ui/react-slot`, and `shadcn` - UI primitive/component tooling dependencies for the component layer under `src/components/ui/`.
- `next-themes` 0.4.6 - Theme provider integration in `src/components/theme-provider.tsx` and theme-dependent UI effects in `src/components/ui/dotted-surface.tsx`.
- `framer-motion` 12.38.0 - Animation runtime used by `src/app/page.tsx` and `src/components/ui/floating-icons-hero-section.tsx`.
- `three` 0.184.0 and `@types/three` 0.184.0 - Three.js visual effect dependency used in `src/components/ui/dotted-surface.tsx`.
- `lucide-react` 1.14.0 - Icon library dependency used across UI components and dashboard pages.

## Configuration

**Environment:**
- Runtime configuration is environment-variable based. The Prisma datasource in `prisma/schema.prisma` requires `DATABASE_URL`.
- Conta Azul OAuth integration reads `CONTA_AZUL_CLIENT_ID`, `NEXT_PUBLIC_CONTA_AZUL_CLIENT_ID`, and `CONTA_AZUL_CLIENT_SECRET` in `src/app/actions/oauth.ts`, `src/app/api/oauth/callback/conta-azul/route.ts`, and `src/lib/token-refresh.ts`.
- Application URL configuration reads `NEXT_PUBLIC_APP_URL` and `APP_URL` in `src/app/actions/oauth.ts`, `src/app/api/oauth/callback/conta-azul/route.ts`, and `src/app/actions/test-api.ts`.
- `NEXT_PUBLIC_API_URL` is configured for the web container in `docker-compose.yml`.
- No `.env` or `.env.example` file is present in the repository root; configure secrets outside source control.

**Build:**
- `package.json` - npm scripts, dependency graph, Prisma seed command, and provider generator command.
- `package-lock.json` - pinned npm dependency resolution.
- `tsconfig.json` - TypeScript strict mode, React JSX transform, module resolution, and `@/*` path alias to `src/*`.
- `next.config.ts` - Next standalone output and allowed dev origin for local tunneling.
- `eslint.config.mjs` - ESLint 9 flat config using Next core web vitals and TypeScript presets.
- `postcss.config.mjs` - Tailwind CSS v4 PostCSS plugin configuration.
- `vitest.config.ts` - Node test environment, globals, and `@` alias for Vitest.
- `prisma/schema.prisma` - Prisma generator, PostgreSQL datasource, and domain models.
- `Dockerfile` - Multi-stage Node 20 Alpine build and standalone Next.js runtime image.
- `docker-compose.yml` - Local PostgreSQL and web service orchestration.

## Platform Requirements

**Development:**
- Node.js 20-compatible environment; install dependencies with `npm install` using `package-lock.json`.
- Docker and Docker Compose for local PostgreSQL and full-stack startup via `npm run db:up`, `npm run setup`, `npm run dev:docker`, or `docker-compose up --build`.
- PostgreSQL-compatible `DATABASE_URL` for Prisma; local containerized DB is defined in `docker-compose.yml`.
- Next.js 16 has breaking APIs and conventions; follow the project instruction in `AGENTS.md` to read relevant `node_modules/next/dist/docs/` docs before modifying Next.js code.

**Production:**
- Standalone Next.js deployment target generated by `next build` with `output: 'standalone'` in `next.config.ts`.
- Container deployment supported through `Dockerfile`; runtime exposes port 3000 and starts via `docker-entrypoint.sh`.
- PostgreSQL database required for `Client`, `ApiKey`, `LinkedAccount`, and `OAuthCredential` data in `prisma/schema.prisma`.
- Vercel-compatible analytics is included through `@vercel/analytics` in `src/app/layout.tsx`; no repository CI workflow is detected under `.github/workflows/`.

---

*Stack analysis: 2026-05-24*
*Update after major dependency changes*
