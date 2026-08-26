# Contributing to Open IpaaS

We want the largest open source catalog of B2B integrations in the world, from
obscure local accounting systems to global CRM giants. The plugin architecture
exists so that adding one costs a folder, not a refactor.

## License and the DCO

Open IpaaS is licensed under the [Apache License 2.0](LICENSE). Contributions are
accepted under the same license.

Every commit must be signed off under the
[Developer Certificate of Origin](https://developercertificate.org/). Signing off
is you stating that you wrote the code, or otherwise have the right to submit it
under the project's license. It is a single line at the end of the commit
message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Git adds it for you with the `-s` flag:

```bash
git commit -s -m "feat(bling): implement customer listing"
```

Forgot on the last commit? `git commit --amend -s --no-edit`.

Why we ask: the DCO records the provenance of every contribution, which keeps
the project's licensing unambiguous for the companies that depend on it. It is
lighter than a CLA, requires no paperwork, and is the same mechanism the Linux
kernel uses.

## Getting set up

```bash
git clone https://github.com/entende-ai/openipaas.git
cd openipaas
cp .env.example .env       # fill in DATABASE_URL at minimum
docker-compose up --build  # Postgres, Redis, migrations, seed, app
```

The app comes up on `http://localhost:3000`, with the interactive API reference
at `/docs`.

Running without Docker:

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

## Before you open a PR

```bash
npx tsc --noEmit    # types
npx eslint src      # lint
npx vitest run      # tests
npm run build       # production build
```

CI runs all four on every push, plus a job that applies the committed migrations
to a real Postgres and fails if `schema.prisma` has drifted from them.

## Adding a provider

This is the contribution we want most.

```bash
npm run generate-provider bling
```

That scaffolds `src/lib/providers/implementations/bling/` with a manifest, a
provider class, a mapper stub and a test, then prints the one line to add to
`src/lib/providers/core/registry.ts`.

The generated provider passes the contract suite immediately: it declares no
capabilities and enables passthrough, so it is honest about what it can do from
day one. Then:

1. Fill in `manifest.ts`: base URL, auth scheme, rate limit.
2. Implement one method and declare its capability in the manifest.
3. Run `npx vitest run`.

### Rules the contract suite enforces

`src/tests/providers/contract.test.ts` runs against every registered provider.
It fails if:

- **A declared capability has no method.** The manifest promised an operation
  that returns 501 in practice.
- **A method has no declared capability.** The operation is undiscoverable and
  throws at runtime.
- The manifest is incomplete, or its base URL has a trailing slash (paths are
  appended directly).

The manifest is the single source of truth. It drives the public catalog, the
connect UI, the OpenAPI capability matrix and the 501 responses. Nothing else
needs to know your provider exists.

### What BaseProvider already does for you

Do not reimplement these:

- URL building, including per tenant hosts and path segments
- Rate limiting per connected account, shared through Redis when configured
- Retry with exponential backoff and full jitter, honouring `Retry-After`
- Refresh and replay on 401, for JSON and binary responses alike
- Passthrough, guarded against path traversal and host injection

A provider implementation should be mappers plus endpoint paths.

### Mappers

Every mapper ends in a Zod parse. That is deliberate: when a platform changes
its API contract without warning, it must fail at our boundary rather than
corrupt data downstream.

Always populate `remoteData` with the raw payload, so callers have an escape
hatch for fields the unified model does not cover.

### Layering

`manifests.ts` holds plain data. `registry.ts` holds provider classes and
server only code. Anything that merely describes the catalog reads
`manifests.ts`.

This is enforced by tests, because getting it wrong once pulled the entire
provider implementation into the browser bundle and broke the build.

## Commits

Conventional Commits, in English:

```
feat(bling): implement customer listing
fix(contaazul): stop duplicating the /v1 path segment
docs: document the passthrough endpoint
```

Explain the why in the body, not just the what. If a change fixes a bug, say
what the bug did.

## Security

Do not open a public issue for a vulnerability. Email security@openipaas.com and
we will respond before any disclosure.

Things that are always in scope for review:

- Credentials must be encrypted at rest, never logged
- Upstream error payloads must never reach an API consumer
- New endpoints must go through `withUnifiedAuth`
