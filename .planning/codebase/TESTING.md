# Testing Patterns

**Analysis Date:** 2026-05-24

## Test Framework

**Runner:**
- Vitest `^4.1.5` from `package.json`.
- Config: `vitest.config.ts` in the project root.
- Test environment: `node` in `vitest.config.ts`.
- Globals are enabled in `vitest.config.ts`, although existing tests still import `describe`, `it`, and `expect` explicitly from `vitest`.

**Assertion Library:**
- Vitest built-in `expect`.
- Existing matchers: `toBe`, `toBeInstanceOf`, `toEqual`, `toThrow`, and `not.toThrow` in `src/tests/mappers/customers.test.ts` and `src/tests/mappers/tiny.test.ts`.
- Zod validation is asserted by wrapping `.parse(...)` in an expectation (example: `expect(() => UnifiedCustomerSchema.parse(result)).not.toThrow()` in `src/tests/mappers/customers.test.ts`).

**Run Commands:**
```bash
npm test                              # Run all tests with Vitest
npm test -- --watch                   # Run tests in watch mode
npm test -- src/tests/mappers/tiny.test.ts  # Run a single test file
npm test -- --coverage                # Run coverage if Vitest coverage provider is installed/configured
npm run lint                          # Run ESLint quality checks
```

## Test File Organization

**Location:**
- Tests live under `src/tests/`, not co-located with production files.
- Mapper/provider tests currently live in `src/tests/mappers/` (examples: `src/tests/mappers/customers.test.ts`, `src/tests/mappers/tiny.test.ts`).
- JSON fixtures live in `src/tests/mocks/` (examples: `src/tests/mocks/contaazul-customer.json`, `src/tests/mocks/omie-customer.json`).
- No `__tests__/` directories are present.

**Naming:**
- Use `*.test.ts` for Vitest files.
- Name test files by the feature or provider area under test (examples: `customers.test.ts` for customer mappers, `tiny.test.ts` for `TinyProvider`).
- No `*.spec.ts`, `*.integration.test.ts`, or `*.e2e.test.ts` files are currently present.

**Structure:**
```
src/
  lib/
    mappers/
      contaazul.ts                  # Production mapper code
      omie-customers.ts             # Production mapper code
    providers/
      implementations/
        TinyProvider.ts             # Production provider code
  tests/
    mappers/
      customers.test.ts             # Mapper validation tests
      tiny.test.ts                  # Provider instantiation test
    mocks/
      contaazul-customer.json       # Conta Azul customer fixture
      omie-customer.json            # Omie customer fixture
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'vitest';
import caMock from '../mocks/contaazul-customer.json';
import omieMock from '../mocks/omie-customer.json';
import { mapContaAzulCustomerToUnified } from '@/lib/mappers/contaazul';
import { mapOmieCustomerToUnified } from '@/lib/mappers/omie-customers';
import { UnifiedCustomerSchema } from '@/lib/validations/unified-schemas';

describe('Customer Mappers', () => {
  it('should map a Conta Azul customer correctly and pass validation', () => {
    const result = mapContaAzulCustomerToUnified(caMock as any);

    expect(() => UnifiedCustomerSchema.parse(result)).not.toThrow();
    expect(result.id).toBe(caMock.id);
    expect(result.name).toBe(caMock.nome);
    expect(result.remoteData?.provider).toBe('CONTA_AZUL');
    expect(result.remoteData?.raw).toEqual(caMock);
  });
});
```

**Patterns:**
- Import Vitest functions explicitly even though `globals: true` is enabled (examples: `src/tests/mappers/customers.test.ts`, `src/tests/mappers/tiny.test.ts`).
- Use top-level `describe('Domain Name', ...)` suites with user-facing domain labels such as `'Customer Mappers'` and `'TinyProvider'`.
- Use `it('should ...', ...)` descriptions for expected behavior.
- Use direct arrange/act/assert flow inside a single `it` block; there is no established `beforeEach`/`afterEach` setup pattern yet.
- Validate mapper output both structurally with Zod and through representative field assertions (example: `src/tests/mappers/customers.test.ts`).
- Keep provider smoke tests minimal when implementation is stubbed (example: `TinyProvider` instantiation in `src/tests/mappers/tiny.test.ts`).

## Mocking

**Framework:**
- Vitest mocking via `vi` is available but not currently used in existing tests.
- Current tests use static JSON fixtures rather than function/module mocks.
- No MSW, Sinon, Jest mocking, or network-mocking library is configured in `package.json`.

**Patterns:**
```typescript
import caMock from '../mocks/contaazul-customer.json';
import { mapContaAzulCustomerToUnified } from '@/lib/mappers/contaazul';

it('should map a Conta Azul customer correctly and pass validation', () => {
  const result = mapContaAzulCustomerToUnified(caMock as any);

  expect(result.remoteData?.raw).toEqual(caMock);
});
```

**What to Mock:**
- Use fixture JSON for external ERP response shapes when testing mappers (examples: `src/tests/mocks/contaazul-customer.json`, `src/tests/mocks/omie-customer.json`).
- Mock `fetch` or provider request helpers for future provider tests that would otherwise call Conta Azul, Omie, or Tiny APIs (production call sites include `src/lib/unified-api-utils.ts`, `src/lib/omie-utils.ts`, `src/lib/providers/implementations/ContaAzulProvider.ts`).
- Mock Prisma for future tests around server actions and auth wrappers (production call sites include `src/app/actions/client.ts`, `src/lib/api-auth.ts`, `src/lib/prisma.ts`).
- Mock Next.js cache/navigation helpers for server-action tests that call `revalidatePath` (example: `src/app/actions/client.ts`).

**What NOT to Mock:**
- Do not mock pure mapper functions when their behavior is the test subject (examples: `mapContaAzulCustomerToUnified` and `mapOmieCustomerToUnified` in `src/tests/mappers/customers.test.ts`).
- Do not mock Zod schemas when validating unified model contracts; use actual schemas from `src/lib/validations/unified-schemas.ts`.
- Do not mock simple class construction in smoke tests like `src/tests/mappers/tiny.test.ts`.

## Fixtures and Factories

**Test Data:**
```typescript
import caMock from '../mocks/contaazul-customer.json';
import omieMock from '../mocks/omie-customer.json';

const contaAzulResult = mapContaAzulCustomerToUnified(caMock as any);
const omieResult = mapOmieCustomerToUnified(omieMock as any);
```

**Location:**
- Store shared provider response samples in `src/tests/mocks/`.
- Existing fixtures are JSON files named by provider and domain: `src/tests/mocks/contaazul-customer.json` and `src/tests/mocks/omie-customer.json`.
- No factory helpers exist yet. If repeated setup grows, add factories under `src/tests/factories/` or near tests under `src/tests/<domain>/` and keep JSON fixtures in `src/tests/mocks/`.
- Preserve raw external provider field names in fixtures so mappers are tested against realistic payloads (examples: `caMock.nome`, `omieMock.codigo_cliente` assertions in `src/tests/mappers/customers.test.ts`).

## Coverage

**Requirements:**
- No coverage threshold is enforced in `vitest.config.ts`.
- No `test:coverage` script is defined in `package.json`.
- Coverage is not configured in CI files in the inspected source/config set.

**Configuration:**
- Coverage provider is not configured in `vitest.config.ts`.
- Tests run in Node environment, which fits mapper/provider/server utility tests but not browser DOM component tests.
- No Testing Library, jsdom, happy-dom, or Playwright dependency is present in `package.json`.

**View Coverage:**
```bash
npm test -- --coverage                # Requires Vitest coverage provider support
```

## Test Types

**Unit Tests:**
- Existing tests are unit/smoke tests.
- Mapper unit tests call pure mapper functions and validate output with Zod schemas and field-level assertions (example: `src/tests/mappers/customers.test.ts`).
- Provider smoke tests instantiate provider classes without external calls (example: `src/tests/mappers/tiny.test.ts`).
- Add new unit tests under `src/tests/<domain>/` for mappers, utilities, schemas, and provider logic.

**Integration Tests:**
- No integration test naming convention is established.
- API routes under `src/app/api/unified/v1/**/route.ts`, auth wrapper `src/lib/api-auth.ts`, Prisma-backed actions in `src/app/actions/`, and token refresh logic in `src/lib/token-refresh.ts` do not have integration tests.
- For future integration tests, prefer real internal modules plus mocked external APIs/Prisma, and name files explicitly if a separate convention is introduced (for example, `src/tests/api/customers.integration.test.ts`).

**E2E Tests:**
- Not used.
- No Playwright, Cypress, or browser E2E configuration is present in `package.json` or root config files.
- Dashboard UI files such as `src/app/dashboard/clients/page.tsx` and `src/app/dashboard/linked-accounts/page.tsx` currently have no E2E tests.

## Common Patterns

**Async Testing:**
```typescript
import { describe, it, expect } from 'vitest';
import { TinyProvider } from '@/lib/providers/implementations/TinyProvider';

describe('TinyProvider', () => {
  it('should reject for unimplemented sale detail calls', async () => {
    const provider = new TinyProvider();

    await expect(provider.getSaleDetail({} as any, 'sale-id')).rejects.toThrow(
      '[TinyProvider] getSaleDetail not implemented',
    );
  });
});
```

**Error Testing:**
```typescript
import { expect, it } from 'vitest';
import { UnifiedCustomerSchema } from '@/lib/validations/unified-schemas';

it('should reject invalid unified customer data', () => {
  expect(() => UnifiedCustomerSchema.parse({})).toThrow();
});
```

**Snapshot Testing:**
- Not used.
- No `__snapshots__/` directories are present.
- Prefer explicit field assertions for mapper/provider behavior because current tests verify schema validity and specific normalized fields in `src/tests/mappers/customers.test.ts`.

---

*Testing analysis: 2026-05-24*
*Update when test patterns change*
