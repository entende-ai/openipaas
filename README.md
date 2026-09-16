# 🚀 Open IpaaS

**The open-source standard for universal B2B integrations.**

Open IpaaS is a high-performance Next.js framework that unifies communication with any SaaS platform (ERPs, CRMs, e-commerce, accounting, ticketing) behind a single **English-first**, **strongly-typed**, **runtime-validated** API.

Enterprise-grade integrations shouldn't be locked behind closed-source paywalls.

[Website](https://openipaas.com) · [Docs](https://openipaas.com/docs) · [Contributing](#-adding-a-provider)

---

## 💎 Why Open IpaaS?

- 🌍 **English first**: your app speaks one standardized vocabulary. The framework normalizes every upstream system underneath.
- 🛡️ **Zod Shield**: every mapper ends in a runtime parse. If a platform changes its contract without warning, it fails at the boundary instead of corrupting your data.
- 🔌 **Plugin architecture**: a provider is one folder plus one line in the registry. The core never changes.
- 🔁 **Resilient by default**: per account rate limiting, retry with exponential backoff, and refresh-and-replay on expired credentials, for every provider.
- 🔓 **Never blocked**: `/passthrough` exposes the raw provider API with credentials handled, so a missing unified field never stops you.

## 🛠 Architecture

```mermaid
graph LR
    Client([Your app]) --> Auth[withUnifiedAuth]
    Auth --> Registry[Provider registry]
    Registry --> Base[BaseProvider]
    Base --> Mapper[Zod mapper]
    Mapper --> SaaS[(Upstream API)]
```

`withUnifiedAuth` handles authentication, rate limiting, idempotency, error translation and request logging. `BaseProvider` handles URL building, throttling, retries, token refresh and passthrough. A provider implementation is left with mappers and endpoint paths.

### Layout

```
src/lib/providers/
  core/               registry, BaseProvider, http, rate-limit, pagination, errors, types
  implementations/
    contaazul/        manifest.ts · provider.ts · mappers/ · types/
    omie/
    tiny/
```

## 🚀 Quick start

```bash
git clone https://github.com/entende-ai/openipaas.git
cd openipaas
docker compose up --build
```

That is the whole setup. Postgres, Redis, migrations, seed data and the app,
with working development defaults for every secret.

- API reference: `http://localhost:3000/docs`
- Dashboard: `http://localhost:3000/dashboard`. The first visit asks you to
  create an account; confirm it with the server password, `development-only`
  by default (`DASHBOARD_PASSWORD`). After that you sign in with your email.

Connecting a provider needs its OAuth credentials, which are yours to register.
Put them in `.env` as `<SLUG>_CLIENT_ID` and `<SLUG>_CLIENT_SECRET`, and register
`http://localhost:3000/api/oauth/callback/<provider-slug>` as the callback.

### Running the app outside Docker

```bash
npm install
npm run setup:env    # writes .env with real generated secrets
npm run setup        # starts Postgres and Redis, migrates, seeds
npm run dev
```

### Environment

`.env.example` documents every variable and ships the same development defaults
as docker compose. For anything real, replace the secrets:

```bash
npm run setup:env -- --print     # prints generated values to paste in
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_APP_URL` | Public URL of this app. Builds the OAuth redirect URI, so it must match what the provider has registered |
| `CREDENTIALS_ENCRYPTION_KEY` | 32 bytes (base64/hex). Encrypts stored provider tokens at rest |
| `DASHBOARD_PASSWORD` + `DASHBOARD_SESSION_SECRET` | Gate the admin console. Without both, `/dashboard` is unreachable |
| `INTERNAL_JOB_SECRET` | Authorizes the webhook delivery job |
| `REDIS_URL` | Shared rate limit and idempotency state. Optional for one instance, required for more than one |
| `<SLUG>_CLIENT_ID` / `<SLUG>_CLIENT_SECRET` | OAuth app per provider, e.g. `CONTA_AZUL_CLIENT_ID` |

The development defaults are published in this repository, so they are not
secret. The app refuses to start in production while any of them is still in
place, rather than running exposed.

Deploying for real is covered in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 📡 Using the API

Start with the **[integration guide](docs/INTEGRATION.md)**: client, key, connection, first call, and what each provider does differently. The reference below is the short version; the live API reference is at `/docs`.

Every request carries two headers:

```bash
curl https://your-host/api/unified/v1/customers \
  -H "Authorization: Bearer oip_live_..." \
  -H "X-Account-Token: <connected account token>"
```

**Pagination** is cursor-based and provider-agnostic:

```json
{ "items": [...], "hasMore": true, "nextCursor": "eyJwYWdlIjoyfQ", "totalItems": 120 }
```

Pass `nextCursor` back as `?cursor=`. `totalItems` is best effort, because cursor based upstreams cannot report a total.

**Idempotency**: send `Idempotency-Key` on writes. Retrying with the same key replays the original response; reusing it with a different body returns `422`.

**Errors** carry a stable `code` and a `requestId` (also in `X-Request-Id`). Upstream payloads are logged, never returned.

**Capabilities**: `GET /api/unified/v1/providers` returns the catalog and the exact operation matrix. A `501 NOT_SUPPORTED` means the connected provider lacks that operation, and it is answered before any upstream call.

**Passthrough**, for anything the unified model does not cover:

```bash
curl https://your-host/api/unified/v1/passthrough/pessoas?pagina=1 \
  -H "Authorization: Bearer oip_live_..." \
  -H "X-Account-Token: ..."
```

## 🌱 Sandbox data

An empty CRM makes for a bad first call: every list comes back `{"data": []}` and there is no way to tell a working integration from a broken one. This fills a trial account with fake companies, contacts and deals, through the unified API itself:

```bash
# Prints the plan and writes nothing
npm run seed:crm -- --api-key oip_live_... --account-token <account token>

# Writes
npm run seed:crm -- --api-key oip_live_... --account-token <account token> --confirm
```

Every record is named with a `[sandbox]` marker so it can be found and deleted later, and each resource is capped at 50 per run. Point it at a trial account, never at one with real customers in it.

## ➕ Adding a provider

```bash
npm run generate-provider bling
```

This scaffolds the folder (manifest, provider class, mapper stub, test) and prints the single registry line to add. The generated provider passes the contract suite immediately: it declares no capabilities and enables passthrough, so it is honest about what it can do from day one.

Then:

1. Fill in `manifest.ts`: base URL, auth, rate limit.
2. Implement a method and declare its capability. The contract suite fails if the two disagree, in either direction.
3. `npx vitest run`

The **manifest is the single source of truth**: it drives the public catalog, the connect UI, the OpenAPI capability matrix and the 501 responses. Nothing else needs to know your provider exists.

### Supported providers

| Provider | Category | Auth | Status |
| --- | --- | --- | --- |
| Conta Azul | Accounting | OAuth2 | Customers, products, sales, sellers, PDF, bulk |
| Omie | Accounting | App key/secret | Customers · passthrough |
| Tiny (Olist) | Accounting | OAuth2 | Passthrough only |

## 🔒 Security

- ERP credentials are encrypted at rest (AES-256-GCM).
- API keys are stored as SHA-256 digests, so the plaintext is shown once, at creation.
- OAuth uses single-use, time-limited server-side `state` (PKCE available per manifest).
- The unified API is rate limited per client; each provider is throttled per connected account.
- Upstream error payloads never reach API consumers.

## 🧪 Tests

```bash
npm test
```

The contract suite in `src/tests/providers/contract.test.ts` runs against **every registered provider**, so a contribution either satisfies the shared contract or the build fails.

## 🤝 Contributing

We want the largest open source catalog of B2B integrations in the world, from
obscure local accounting systems to global CRM giants. The plugin architecture is
designed so that adding one costs a folder, not a refactor.

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Commits need a
[DCO sign off](CONTRIBUTING.md#license-and-the-dco), which `git commit -s` adds
for you.

## 📄 License

[Apache License 2.0](LICENSE). Use it commercially, modify it, self host it, ship
it inside your product. The only obligations, and only when you redistribute, are
to keep the notices and state your changes.

Apache 2.0 rather than MIT for the express patent grant, which is what lets a
corporate legal review approve it without an argument.
See [docs/LICENSING.md](docs/LICENSING.md) for the reasoning.
