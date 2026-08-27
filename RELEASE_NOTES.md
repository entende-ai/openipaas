# Release Notes

## v0.2.0: Plugin architecture, platform layer and security hardening

The theme of this release is **removing the reason the catalog could not grow**.

Before it, adding an integration meant editing the provider factory, roughly
fifteen route files, the retry helper and the refresh helper. The core was open
for modification, so every new provider paid a tax in the wrong place. It is now
closed: a provider is one folder plus one line in the registry.

Along the way, three bugs that broke real functionality and three security
findings were fixed.

---

## ⚠️ Required actions before deploying

1. **Apply the migrations.** Two are included and both are purely additive (no
   `DROP`, no data loss). `0_init` is the baseline for the existing schema;
   `1_platform_and_credentials` adds the new columns and tables, and backfills
   the API key digests in SQL.

   ```bash
   npx prisma migrate deploy
   ```

   If your database already has the `0_init` tables, mark that baseline as
   applied first: `npx prisma migrate resolve --applied 0_init`.

2. **Set `CREDENTIALS_ENCRYPTION_KEY`, then backfill.** Existing tokens are
   plaintext. They keep working (decryption passes unprefixed values through),
   but they are not protected until the backfill runs.

   ```bash
   openssl rand -base64 32               # put the result in the env
   npm run encrypt-credentials -- --dry-run
   npm run encrypt-credentials
   ```

   Without this key the app boots in development but **refuses to store
   credentials in production**.

3. **Set `DASHBOARD_PASSWORD` and `DASHBOARD_SESSION_SECRET`.** Without both, no
   session can be issued and `/dashboard` stays closed.

4. **Set `INTERNAL_JOB_SECRET`** and schedule `POST /api/internal/webhooks/deliver`
   if you intend to use webhooks.

See `.env.example`, now versioned, because it was matched by the `.env*` ignore rule and
had never been committed.

---

## 🐛 Bugs fixed

**Every sales endpoint was returning 404.** `BASE_URL` already ended in `/v1` and
the five Conta Azul sale paths repeated it, producing
`api-v2.contaazul.com/v1/v1/venda/...`. Only the PDF escaped, because it used a
direct `fetch` with the correct path. A regression test now guards it, verified
by reintroducing the bug and watching the test fail.

**Dynamic routes read `undefined` ids.** Next.js 16 removed synchronous `params`
access, so `const { id } = params` was destructuring a property off a Promise.
All five dynamic routes now `await ctx.params`. The two `as any` casts on the
sales exports were hiding exactly this type error.

**The sale PDF never refreshed an expired token.** `PDF_REFRESH_NEEDED` was
raised and only re-thrown, because the retry helper handled JSON only. Refresh
and replay is now response-format agnostic and shared by both paths.

**The middleware would have failed in the Edge Runtime.** Session verification
imported Node's `crypto`; the build warned without failing. Signing and
verification now use Web Crypto only.

**`next build` depended on the production database.** Dashboard pages were being
prerendered, opening a connection to the live database at build time, so the build
broke the moment the schema changed. They show live data behind a session and are
now `force-dynamic`.

---

## 🔒 Security

| Finding | Before | Now |
| --- | --- | --- |
| ERP credentials | Plaintext in Postgres | AES-256-GCM at rest |
| API keys | Compared as plaintext | SHA-256 digest; plaintext shown once |
| OAuth `state` | The raw `clientId` | Single-use, expiring, server-side value |
| Admin dashboard | No authentication | Signed session; actions guarded independently |
| Error responses | Raw upstream `error.message` | Safe message, stable code, request id |
| Account tokens | Distinguishable responses | Uniform response, not probeable |
| Active credential | `credentials[0]`, unordered | Deterministic ordering |
| Dev seed | Ran on every container boot, deleting every row | Gated behind `RUN_SEED`, refuses in production |

---

## ✨ Plugin architecture

**Registry + manifest.** `src/lib/providers/core/registry.ts` is the only line to
touch. Each manifest declares category, auth, rate limit, capabilities and
passthrough, and feeds the public catalog, the connect UI, the OpenAPI
capability matrix and the 501 responses.

**BaseProvider** absorbs what was duplicated or missing: URL building,
per-account rate limiting, retry with exponential backoff and full jitter,
timeouts, refresh-and-replay on 401 (JSON and binary), and passthrough guarded
against path traversal and host injection. Implementations are left with mappers
and endpoint paths.

**Capabilities are declared, not discovered.** `OmieProvider` had six methods
that only threw. Unsupported operations are now refused with a precise 501
*before* any upstream call.

**Domain modules** replace the monolithic seven-method interface, so a provider
implements only what its API has: a CRM has no products, a payment gateway has
no sellers.

**Generic credentials.** `authType`, an encrypted secrets bag, `instanceUrl` and
`externalTenantId` mean Omie stops smuggling its app key/secret through
`accessToken`/`refreshToken`, and Shopify, Nuvemshop and Salesforce fit with no
further schema change.

---

## 🚀 Platform

- **Request logs are real.** The logs page was generating rows with
  `Math.random()`. There is now a `RequestLog` table written on every call, with
  24h volume, success rate and average latency.
- **Rate limiting** per API key (429 with `Retry-After`) and per connected
  account, so one customer cannot exhaust another's ERP quota.
- **Idempotency.** `Idempotency-Key` replays the first response; the same key
  with a different body returns 422 instead of silently creating a second record.
- **Webhooks.** Queued before they are attempted, signed with an HMAC over
  `timestamp.body` (the timestamp is inside the signed payload, so deliveries
  cannot be replayed), with backoff across six attempts.
- **Writes are reachable.** `POST`/`PATCH`/`DELETE` used to return 501
  unconditionally; the reverse mappers that already existed were dead code.

---

## 🔌 API changes

### New endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/unified/v1/providers` | Public catalog and capability matrix, served from the manifests |
| `ANY /api/unified/v1/passthrough/{path}` | Raw provider API with credentials, throttling and retries applied |
| `POST /api/internal/webhooks/deliver` | Drains the webhook queue (scheduler only) |

### Backwards compatible

- **List responses gain fields**: `hasMore` and `nextCursor` alongside the
  existing `items` and `totalItems`. Cursors are opaque; pass `nextCursor` back
  as `?cursor=`. `totalItems` is now optional, because cursor-based upstreams
  (Shopify, HubSpot, Stripe) cannot report one.
- **The OAuth callback** moved from a Conta Azul-specific route to a generic
  `[provider]` handler. **The resolved URL is unchanged**, so registered redirect
  URIs stay valid.
- **Error bodies** now carry `code` and `requestId` in addition to `error`. The
  `X-Request-Id` header is on every response.

### Behavioural changes to be aware of

- Unsupported operations return **501 with a `NOT_SUPPORTED` code** instead of
  failing somewhere inside a mapper.
- Error messages no longer echo the upstream payload. Quote the `requestId` when
  investigating.
- API keys **cannot be retrieved after creation**. The dashboard shows the
  prefix; the plaintext appears once, at creation.
- **API keys are now prefixed `oip_live_` instead of `sk_live_`.** The old prefix
  collides with Stripe's secret key namespace, so every Open IpaaS key tripped
  secret scanners as a "Stripe API Key" -- and a customer leaking one would have
  had it misattributed. Existing keys keep working: authentication matches on the
  SHA-256 digest, never on the format. Only newly issued keys use the new prefix.

---

## 🧪 Quality

| | Before | After |
| --- | --- | --- |
| Tests | 8 | **101** |
| Test runner on Windows | Broken | Working |
| `next build` | 22 routes, needed the database | **29 routes**, no database, no Edge warning |
| ESLint errors | 96 | **52** |
| Provider `switch` statements in routes | ~15 | **0** |

The suite could not run on Windows at all: `package-lock.json` carried 14 of the
15 rolldown bindings, missing exactly `win32-x64-msvc`.

The centrepiece is `src/tests/providers/contract.test.ts`, which runs against
**every registered provider** and asserts that declared capabilities and
implemented methods agree *in both directions*. That is what makes a community
contribution reviewable without reading the whole implementation.

---

## 📦 Adding a provider

```bash
npm run generate-provider bling
```

Scaffolds the folder (manifest, provider class, mapper stub, test) and prints
the one registry line to add. The generated provider passes the contract suite
immediately: it declares no capabilities and enables passthrough, so it is honest
about what it can do from day one.

Verified end to end during development by scaffolding a provider, registering it
and watching the contract suite accept it.

---

## 🧭 Not covered by this release

**Nothing was verified against live provider APIs.** All 101 tests use a mocked
`fetch`. The new OAuth flow, token refresh and the Conta Azul calls need a smoke
test against a real connected account.

**The migrations have not been applied to any database.** They were generated
offline with `prisma migrate diff`.

Still open, in rough priority order:

- Inbound webhooks (receiving provider events, not just emitting ours)
- A sync/cache layer: everything is still synchronous passthrough, so upstream
  latency is your latency
- Multi-tenant user accounts; the dashboard session is a single shared operator
  password
- Dropping the legacy plaintext `ApiKey.key` column once every deployment reads
  from `keyHash`
- Rate limit and idempotency state in Redis; both are currently per-instance
- Completing Omie, and the second category (e-commerce), per the integration
  roadmap
