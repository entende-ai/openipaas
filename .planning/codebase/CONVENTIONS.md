# Coding Conventions

**Analysis Date:** 2026-05-24

## Naming Patterns

**Files:**
- Use Next.js App Router conventions under `src/app/`: route handlers live in `route.ts`, pages in `page.tsx`, and layouts in `layout.tsx` (examples: `src/app/api/unified/v1/customers/route.ts`, `src/app/dashboard/clients/page.tsx`, `src/app/dashboard/layout.tsx`).
- Use PascalCase for exported React component files outside the shared UI primitive directory (examples: `src/components/Sidebar.tsx`, `src/app/dashboard/clients/components/CreateClientDialog.tsx`, `src/app/dashboard/linked-accounts/components/TestApiDialog.tsx`).
- Use kebab-case for shadcn/Base UI primitive component files under `src/components/ui/` (examples: `src/components/ui/dotted-surface.tsx`, `src/components/ui/floating-icons-hero-section.tsx`).
- Use provider names in PascalCase for provider classes and files under `src/lib/providers/implementations/` (examples: `src/lib/providers/implementations/ContaAzulProvider.ts`, `src/lib/providers/implementations/TinyProvider.ts`).
- Use domain-oriented lowercase/kebab-case files for utilities, mappers, and schemas under `src/lib/` (examples: `src/lib/api-auth.ts`, `src/lib/unified-api-utils.ts`, `src/lib/mappers/omie-customers.ts`, `src/lib/validations/unified-schemas.ts`).
- Place tests in the dedicated `src/tests/` tree with `*.test.ts` filenames (examples: `src/tests/mappers/customers.test.ts`, `src/tests/mappers/tiny.test.ts`).

**Functions:**
- Use camelCase for functions and methods (examples: `mapContaAzulCustomerToUnified` in `src/lib/mappers/contaazul.ts`, `withUnifiedAuth` in `src/lib/api-auth.ts`, `createClient` in `src/app/actions/client.ts`).
- Prefix mapper functions with `map` and include source and target concepts (examples: `mapContaAzulListToUnified` in `src/lib/mappers/contaazul.ts`, `mapOmieCustomerToUnified` in `src/lib/mappers/omie-customers.ts`).
- Use `handle*` or `on*` names for component event handlers and submit functions (examples: `handleTest` in `src/app/dashboard/linked-accounts/components/TestApiDialog.tsx`, `onSubmit` in `src/app/dashboard/clients/components/CreateClientDialog.tsx`).
- Use route-specific handler names before wrapping with auth middleware (examples: `customersHandler` in `src/app/api/unified/v1/customers/route.ts`, `categoriesHandler` in `src/app/api/unified/v1/products/categories/route.ts`).
- Async functions do not need a special prefix; mark the actual function `async` and return Promises explicitly on interfaces (example: `IUnifiedProvider` methods in `src/lib/providers/IProvider.ts`).

**Variables:**
- Use camelCase for local variables and state values (examples: `linkedAccount`, `queryParams`, and `authContext` in `src/app/api/unified/v1/customers/route.ts`).
- Use `[value, setValue]` naming for React state (examples: `open`/`setOpen` and `isLoading`/`setIsLoading` in `src/app/dashboard/clients/components/CreateClientDialog.tsx`).
- Use UPPER_SNAKE_CASE for provider identifiers and enum-like string values (examples: `'CONTA_AZUL'` in `src/lib/providers/implementations/ContaAzulProvider.ts`, `'NATURAL' | 'LEGAL' | 'FOREIGN' | 'UNKNOWN'` in `src/types/unified.ts`).
- Avoid underscore-prefixed private members; TypeScript `private` is used when privacy is needed (example: `private async request` in `src/lib/providers/implementations/ContaAzulProvider.ts`).

**Types:**
- Use PascalCase for interfaces and type aliases with no `I` prefix except the established provider interface name `IUnifiedProvider` in `src/lib/providers/IProvider.ts`.
- Use `Unified*` prefixes for canonical platform data types and schemas (examples: `UnifiedCustomer` in `src/types/unified.ts`, `UnifiedCustomerSchema` in `src/lib/validations/unified-schemas.ts`).
- Use provider-specific prefixes for external provider shapes (examples: `ContaAzulCustomer` in `src/types/contaazul.ts`, `ContaAzulPersonType` in `src/lib/mappers/contaazul.ts`).
- Prefer interfaces for object contracts exported from `src/types/` and type aliases for unions (examples: `UnifiedCustomer` and `UnifiedSaleStatus` in `src/types/unified.ts`).

## Code Style

**Formatting:**
- No Prettier configuration is present; rely on ESLint plus local file style. Keep indentation at 2 spaces in TypeScript, TSX, JSON, and Prisma-adjacent scripts.
- Quote style is mixed: many App Router/action files use single quotes without semicolons (examples: `src/app/actions/client.ts`, `src/lib/api-auth.ts`), while shared UI/provider files often use double quotes with semicolons (examples: `src/components/ui/button.tsx`, `src/lib/providers/implementations/ContaAzulProvider.ts`). Match the style of the file being edited.
- Semicolon style is mixed by area. Preserve existing file style: omit semicolons in files like `src/app/api/unified/v1/customers/route.ts`; use semicolons in files like `src/components/ui/button.tsx` and `src/lib/validations/unified-schemas.ts`.
- Keep object literals and Prisma calls multi-line when they contain nested `data`, `where`, or `include` blocks (examples: `src/app/actions/client.ts`, `src/lib/api-auth.ts`).
- Keep Tailwind class strings inline for simple elements and centralize reusable variants with `class-variance-authority` for shared UI primitives (example: `buttonVariants` in `src/components/ui/button.tsx`).

**Linting:**
- Use ESLint 9 with the flat config in `eslint.config.mjs`.
- The lint config extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` via `nextVitals` and `nextTs` in `eslint.config.mjs`.
- Default ignored paths are `.next/**`, `out/**`, `build/**`, and `next-env.d.ts` in `eslint.config.mjs`.
- Run `npm run lint` from `package.json` before completing code changes.
- TypeScript is strict (`strict: true`) and uses bundler module resolution with the Next plugin in `tsconfig.json`.

## Import Organization

**Order:**
1. Framework/runtime imports (`next/server`, `next/cache`, `react`, Node built-ins) as seen in `src/app/api/unified/v1/customers/route.ts`, `src/app/actions/client.ts`, and `src/app/dashboard/clients/components/CreateClientDialog.tsx`.
2. Third-party package imports (`@prisma/client`, `class-variance-authority`, `@radix-ui/react-slot`, `zod`) as seen in `src/lib/api-auth.ts`, `src/components/ui/button.tsx`, and `src/lib/validations/unified-schemas.ts`.
3. Internal absolute imports with `@/` (examples: `@/lib/api-auth`, `@/lib/providers/ProviderFactory`, `@/components/ui/button`).
4. Relative imports for files within the same provider or utility area (example: `../IProvider` in `src/lib/providers/implementations/ContaAzulProvider.ts`, `./prisma` in `src/lib/api-auth.ts`).
5. JSON fixtures in tests after Vitest imports (examples: `src/tests/mappers/customers.test.ts`).

**Grouping:**
- Use a blank line between imports and executable code. Existing files generally do not enforce blank lines between import groups, so do not introduce noisy reordering unless editing imports for functional reasons.
- Use grouped named imports for related types from the same module, especially domain types from `@/types/unified` (examples: `src/lib/providers/IProvider.ts`, `src/lib/providers/implementations/ContaAzulProvider.ts`).
- Import React as a namespace in shadcn-style primitives that use `forwardRef` (example: `import * as React from "react"` in `src/components/ui/button.tsx`).

**Path Aliases:**
- `@/*` maps to `./src/*` in both `tsconfig.json` and `vitest.config.ts`.
- Use `@/` for cross-directory application imports (examples: `@/lib/mappers/contaazul` in `src/tests/mappers/customers.test.ts`, `@/components/ui/input` in `src/app/dashboard/clients/components/CreateClientDialog.tsx`).
- Use relative imports for same-layer local modules when established by the file (example: `./prisma` in `src/lib/api-auth.ts`).

## Error Handling

**Patterns:**
- API routes should wrap provider/external work in `try/catch` and return `NextResponse.json({ error }, { status })` rather than throwing through Next.js (examples: `src/app/api/unified/v1/customers/route.ts`, `src/app/api/unified/v1/products/categories/route.ts`).
- Auth boundary failures should return early with explicit status codes before invoking the handler (examples: missing `Authorization`, invalid API key, and missing `X-Account-Token` branches in `src/lib/api-auth.ts`).
- External API helpers throw `Error` instances with provider-specific messages after logging raw response context (examples: `src/lib/unified-api-utils.ts`, `src/lib/omie-utils.ts`).
- Provider methods may throw sentinel errors for route-level handling when a lower-level helper cannot support a response type (example: `PDF_REFRESH_NEEDED` in `src/lib/providers/implementations/ContaAzulProvider.ts`).
- Server actions return small `{ success: true }` / `{ error: string }` result objects for expected form validation outcomes (example: `createClient` in `src/app/actions/client.ts`).

**Error Types:**
- Use plain `Error` today; custom error classes are not established in `src/lib/`.
- Use typed status responses for expected HTTP failures: `401` for auth failures in `src/lib/api-auth.ts`, `400` for unsupported providers in `src/app/api/unified/v1/products/categories/route.ts`, `501` for unimplemented provider methods in `src/app/api/unified/v1/customers/route.ts`.
- Avoid broad `any` for new error handling where possible, but match existing route patterns when extending files that currently use `catch (error: any)` (examples: `src/app/api/unified/v1/customers/route.ts`, `src/app/api/unified/v1/sales/route.ts`).
- Include `error.message` in API responses only for expected provider/application errors; use generic messages for auth boundary internal failures (example: `src/lib/api-auth.ts`).

## Logging

**Framework:**
- Logging uses `console.log` and `console.error`; no structured logging library is configured in `package.json`.
- Route and helper logs use bracketed context prefixes (examples: `[Unified Customers API Error]` in `src/app/api/unified/v1/customers/route.ts`, `[UnifiedAuth] Error:` in `src/lib/api-auth.ts`, `[Conta Azul Raw Error]` in `src/lib/unified-api-utils.ts`).

**Patterns:**
- Use `console.error` at API and external-service boundaries when returning a failure response or throwing after a failed provider response (examples: `src/app/api/unified/v1/customers/route.ts`, `src/lib/omie-utils.ts`).
- Use `console.log` sparingly for explicit debug/progress messages; debug logging currently exists in token refresh, OAuth callback, and the linked-account test dialog (examples: `src/lib/token-refresh.ts`, `src/app/api/oauth/callback/conta-azul/route.ts`, `src/app/dashboard/linked-accounts/components/TestApiDialog.tsx`).
- Never log full secret values. Existing OAuth logging in `src/app/api/oauth/callback/conta-azul/route.ts` masks the client secret and only reports whether values are loaded.

## Comments

**When to Comment:**
- Use comments to explain boundary behavior, provider limitations, or external-service constraints (examples: PDF direct fetch explanation in `src/lib/providers/implementations/ContaAzulProvider.ts`, auth step comments in `src/lib/api-auth.ts`).
- Avoid comments that merely restate field checks or validation in simple tests; new tests should prefer descriptive `it(...)` names over obvious inline comments (current examples exist in `src/tests/mappers/customers.test.ts`).
- Use comments for generated/provider scaffolding context when a generated file needs attribution (example: `Tiny Provider Implementation` in `src/lib/providers/implementations/TinyProvider.ts`).

**JSDoc/TSDoc:**
- JSDoc/TSDoc is not broadly used. Do not add large documentation blocks unless exporting a reusable public API with non-obvious behavior.
- Lightweight block comments are acceptable for provider classes or generated code (example: `src/lib/providers/implementations/TinyProvider.ts`).

**TODO Comments:**
- No formal TODO format is established. If adding TODOs, use `// TODO: concise action` and include an issue/reference when available.
- Prefer encoding not-yet-implemented behavior as explicit `501` responses or thrown errors where the code path can be executed (examples: `src/app/api/unified/v1/customers/route.ts`, `src/lib/providers/implementations/TinyProvider.ts`).

## Function Design

**Size:**
- Keep pure mapper functions small and single-purpose (example: `mapPersonType` and `mapContaAzulCustomerToUnified` in `src/lib/mappers/contaazul.ts`).
- Route handlers should remain thin: parse request inputs, obtain provider/helper, call domain logic, and convert result/errors to `NextResponse` (examples: `src/app/api/unified/v1/customers/route.ts`, `src/app/api/unified/v1/products/categories/route.ts`).
- Extract reusable provider/external request behavior to helpers rather than duplicating fetch/retry code in routes (example: `unifiedErpRequestWithRetry` used by `src/lib/providers/implementations/ContaAzulProvider.ts`).

**Parameters:**
- Provider interface methods currently accept `credentials: any` and `params: any`; match `IUnifiedProvider` in `src/lib/providers/IProvider.ts` until those contracts are typed.
- Prefer `FormData` for server action form submissions (example: `createClient(formData: FormData)` in `src/app/actions/client.ts`).
- Use route context/auth context injection via wrappers instead of reading auth state globally (example: `withUnifiedAuth(handler)` in `src/lib/api-auth.ts`).

**Return Values:**
- Mappers should return validated unified models by parsing through Zod schemas before returning (example: `UnifiedCustomerSchema.parse(mappedData)` in `src/lib/mappers/contaazul.ts`).
- List functions should return `{ items, totalItems }` using `UnifiedListResponse<T>` (examples: `src/types/unified.ts`, `src/lib/mappers/contaazul.ts`, `src/lib/providers/implementations/ContaAzulProvider.ts`).
- API routes should return `NextResponse.json(...)` for all paths (examples: `src/app/api/unified/v1/customers/route.ts`, `src/app/api/unified/v1/products/categories/route.ts`).
- Server actions should revalidate affected dashboard paths and return compact success/error objects (example: `src/app/actions/client.ts`).

## Module Design

**Exports:**
- Prefer named exports for functions, React components, schemas, and provider classes (examples: `createClient` in `src/app/actions/client.ts`, `CreateClientDialog` in `src/app/dashboard/clients/components/CreateClientDialog.tsx`, `UnifiedCustomerSchema` in `src/lib/validations/unified-schemas.ts`).
- Use default export for singleton-style infrastructure modules when there is one canonical instance (example: Prisma client in `src/lib/prisma.ts`).
- Next.js route files export HTTP method constants (`GET`, `POST`) after wrapping handlers with middleware where needed (example: `src/app/api/unified/v1/customers/route.ts`).
- Shared UI primitives export the component and variant helper together when variants are reusable (example: `export { Button, buttonVariants }` in `src/components/ui/button.tsx`).

**Barrel Files:**
- Barrel files are not a dominant pattern. Import directly from concrete files such as `@/components/ui/button`, `@/lib/providers/ProviderFactory`, and `@/lib/validations/unified-schemas`.
- Do not add new `index.ts` barrels unless a directory already uses one or a public API boundary clearly requires it.

---

*Convention analysis: 2026-05-24*
*Update when patterns change*
