# Integration guide

From zero to a working call. Read this once, then use the API reference at `/docs` for the field by field detail.

- [What the pieces are](#what-the-pieces-are)
- [1. Create a client](#1-create-a-client)
- [2. Issue an API key](#2-issue-an-api-key)
- [3. Connect an account](#3-connect-an-account)
- [What a key may do](#what-a-key-may-do)
- [Service names](#service-names)
- [What a client has connected](#what-a-client-has-connected)
- [4. Make the first call](#4-make-the-first-call)
- [Paging through a list](#paging-through-a-list)
- [Reading only what changed](#reading-only-what-changed)
- [Writing](#writing)
- [Writing a record you may already have](#writing-a-record-you-may-already-have)
- [Knowing what a provider can do](#knowing-what-a-provider-can-do)
- [How much you may call](#how-much-you-may-call)
- [Errors](#errors)
- [Passthrough](#passthrough)
- [Being told when a connection breaks](#being-told-when-a-connection-breaks)
- [Provider notes](#provider-notes)
- [Nothing to read yet](#nothing-to-read-yet)

## What the pieces are

Four nouns, and they only make sense together:

| | What it is | Where it lives |
|---|---|---|
| **Client** | Whoever consumes your unified API: a customer, an internal app, a partner. | Dashboard, Clients |
| **API key** | The client's credential. Sent as `Authorization: Bearer ...`. A client can hold several, one per caller. | Issued per client, shown once |
| **Connection** | One provider account (an RD Station CRM account, a Conta Azul account) that a client is allowed to reach. | Dashboard, Connections |
| **Connection token** | Pins one exact connection. Sent as `X-Account-Token: ...`, a header name kept for compatibility. | Shown on the connection |

**The key is the client, the service picks the system.** A key belongs to exactly one client and reaches that client's connections and nothing else. Each call then says which connection it means, in one of two ways:

- `X-Provider: RD_STATION_CRM`, the name of the service. Readable, and all you need while the client has one account on that service.
- `X-Account-Token: ...`, the connection token. Needed when a client has two accounts on the same service, where `X-Provider` answers `409 AMBIGUOUS_CONNECTION` rather than guess. It wins when both are sent.

Either way, one integration serves many end customers without changing a line of code: a different key is a different client.

Creating clients and issuing their keys can also be done from your own product, through the
[admin API](ADMIN.md), which is the same two steps as a call.

## 1. Create a client

Dashboard, **Clients**, **New client**. A name is all it takes.

If you are integrating your own product, one client is enough. If you are reselling the integration, one client per customer keeps keys revocable independently.

## 2. Issue an API key

On the client, **Issue key**.

The plaintext is shown once and never again: only a SHA-256 digest and a short display prefix are stored, so a database dump yields nothing usable. Copy it into your secret store at that moment. If you lose it, revoke it and issue another; there is no recovery path by design.

Keys look like `oip_live_...`.

## What a key may do

A key carries scopes, written `action:resource`. Two actions, `read` and `write`; the resource is the one in the
URL, or `*` for all of them:

```
read:*          write:*            everything, which is the default
read:*                             lists and lookups, nothing that changes anything
read:contacts   write:contacts     one resource, both ways
```

Choose them when you issue the key, in the dialog. They cannot be edited afterwards, on purpose: widening what
something already running may do, without that thing being told, is how a key ends up with more reach than anyone
remembers granting. Issue a second key and revoke the first.

A call outside the scopes is refused with `403 FORBIDDEN` before any provider is reached, and the message says
what the key can do. Keys issued before scopes existed carry none, which means everything.

Two things worth knowing:

- `passthrough` is its own resource, and it is the provider's whole API. A key that can reach it can reach
  everything that provider exposes, whatever else you picked.
- A scoped key handed to an agent gets a shorter MCP tool list rather than tools that fail. A read-only key sees
  no `create_` tools at all, and its `passthrough` tool accepts only `GET`.

## 3. Connect an account

Dashboard, **Connections**, **Connect**. Pick the provider and the client, then finish the provider's own login.

For OAuth providers such as RD Station CRM, the browser goes to the provider, you approve, and the callback returns with the connection stored. Access and refresh tokens are encrypted at rest; refreshes happen automatically and, for providers that rotate refresh tokens on use, are serialized per credential so two concurrent calls cannot invalidate each other.

The connection shows its **service name** (`RD_STATION_CRM`), which is what `X-Provider` takes, and its **connection token**, which is the `X-Account-Token` value when you need to pin this exact account.

## Service names

`GET /api/unified/v1/providers` lists every service this deployment knows, with the `slug` that `X-Provider` expects. It is public, so it needs no key at all. Matching is case-insensitive, so `rd_station_crm` works as well.

## What a client has connected

`GET /providers` is the catalog of what the platform supports. `GET /connections` is what one client has:

```bash
curl https://app.openipaas.com/api/unified/v1/connections \
  -H "Authorization: Bearer oip_live_..."
```

```json
{
  "items": [
    {
      "id": "1f0a...",
      "label": "RD Station CRM",
      "service": "RD_STATION_CRM",
      "serviceName": "RD Station CRM",
      "status": "active",
      "statusDetail": "Token valid for 2 hours.",
      "needsAttention": false,
      "connectionToken": "act_...",
      "agentToolPrefix": "rd_station_crm__",
      "connectedAt": "2026-09-01T10:00:00.000Z",
      "lastUsedAt": "2026-09-21T09:00:00.000Z",
      "capabilities": { "contacts": ["list", "get", "create", "update", "search", "upsert"] },
      "passthrough": true
    }
  ],
  "totalItems": 1
}
```

It takes the key on its own, with no connection named, and answers with the connections of that key's client and
no others. Three things it is for:

- Drawing a screen. `status` and `statusDetail` say why something is not answering, and `needsAttention` is the
  one field worth putting a badge on. Connections with no working credential are listed, not hidden.
- Knowing what to send. `service` is the `X-Provider` value; `capabilities` is what that connection supports, so
  you can avoid a call that would come back `501 NOT_SUPPORTED`.
- Recovering from an ambiguity on your own. `connectionToken` is the `X-Account-Token` that pins one account.

The connection token is an address, not a credential: on its own it authenticates nothing, and it only means
anything alongside a key that already reaches that connection. That is why this endpoint can hand it over.

## 4. Make the first call

```bash
curl https://app.openipaas.com/api/unified/v1/contacts \
  -H "Authorization: Bearer oip_live_..." \
  -H "X-Provider: RD_STATION_CRM"
```

```json
{
  "items": [
    {
      "id": "65f1c0...",
      "name": "Ana Ribeiro",
      "email": "ana.ribeiro@exemplo.com.br",
      "emails": ["ana.ribeiro@exemplo.com.br"],
      "phones": ["+5511980000000"],
      "title": "Diretora Comercial",
      "companyId": "65f1bf...",
      "companyName": "Padaria Sao Jorge",
      "owner": { "id": "5f2...", "name": "Felipe", "email": "felipe@exemplo.com.br" },
      "createdAt": "2026-09-16T03:11:02.000Z",
      "updatedAt": null
    }
  ],
  "hasMore": true,
  "nextCursor": "eyJwYWdlIjoyfQ"
}
```

The same shape comes back whichever provider is behind the account. Pointing `X-Provider` at another service, or the key at another client, does not change your code.

There is a playground in the dashboard on each connection, which sends exactly this request with that connection's own credentials. Use it to confirm a connection before writing any code.

## Paging through a list

Cursor based, because most upstream APIs are:

```bash
curl "https://app.openipaas.com/api/unified/v1/deals?limit=50" -H ... 
curl "https://app.openipaas.com/api/unified/v1/deals?limit=50&cursor=eyJwYWdlIjoyfQ" -H ...
```

Loop while `hasMore` is true, passing `nextCursor` back as `cursor`. Never build the cursor yourself: it is opaque and its contents differ per provider.

`totalItems` is best effort and is **absent from the response** for providers whose API cannot report a total, which is the case for RD Station CRM. Do not drive a progress bar off it without a fallback.

`search` is accepted where the provider supports free-text search, and ignored where it does not.

## Reading only what changed

A full page walk is fine for a first load and wrong for a sync that runs every ten minutes. List endpoints take
`updatedAfter`, an ISO-8601 instant:

```bash
curl "https://app.openipaas.com/api/unified/v1/contacts?updatedAfter=2026-09-22T00:00:00Z" \
  -H "Authorization: Bearer oip_live_..." \
  -H "X-Provider: RD_STATION_CRM"
```

It works only where the provider documents such a filter, and a resource that does not have one answers
`501 NOT_SUPPORTED` naming the ones that do. That refusal is the point: a provider handed a filter it does not
know answers with its whole table, and a caller expecting a delta has no way to tell that it got everything.

Which resources accept it is in the catalog and in the connection, as `incremental`:

```bash
curl https://app.openipaas.com/api/unified/v1/providers | jq '.items[] | {slug, incremental}'
```

Today: RD Station CRM on `contacts`, `companies` and `deals`. Nothing on the others yet, which means their
documentation does not promise it, not that the data cannot change.

Two things to get right when you build on this:

- Keep the timestamp of the last successful run, not of the last record you saw, and overlap it by a minute. A
  record written while you were paging would otherwise fall between two runs.
- `updatedAfter` filters; it does not tell you about deletions. A record deleted upstream simply stops appearing,
  so a periodic full read is still what reconciles removals.

## Writing

```bash
curl -X POST https://app.openipaas.com/api/unified/v1/companies \
  -H "Authorization: Bearer oip_live_..." \
  -H "X-Provider: RD_STATION_CRM" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 4f0c1d2e-order-8821" \
  -d '{"name": "Padaria Sao Jorge", "website": "https://padariasaojorge.com.br"}'
```

Send an `Idempotency-Key` on every write. Retrying with the same key replays the original response instead of creating a second record, which is what makes a network timeout safe to retry. Reusing the same key with a different body returns `422`, because that is a bug in the caller rather than a retry.

The response is the created record in unified shape, with the provider's id in `id`.

## Writing a record you may already have

Most sync code does not know whether the contact exists. The honest answer used to be: call create, catch a provider-specific duplicate error, parse it, call update. That is exactly the provider-specific branching this API exists to remove.

```bash
curl -X POST https://app.openipaas.com/api/unified/v1/contacts/upsert \
  -H "Authorization: Bearer oip_live_..." \
  -H "X-Provider: RD_STATION_CRM" \
  -H "Content-Type: application/json" \
  -d '{"field": "email", "value": "ana@exemplo.com.br", "data": {"name": "Ana Ribeiro", "title": "CEO"}}'
```

```json
{ "record": { "id": "65f1c0...", "name": "Ana Ribeiro", "title": "CEO" }, "created": false }
```

- **`created` tells you which happened**, and the status says it too: `201` when it created, `200` when it updated. A sync that counts what it added does not need another call to find out.
- **Only the fields you send are written.** Everything else on the record is left alone.
- **An ambiguous match is refused**, not resolved by guessing. If `field` and `value` find three contacts, you get an error naming the count, because writing to one of three at random is worse than failing.
- **The field has to be one the provider can filter on.** RD Station CRM accepts `email`, `phone`, `name`, `job_title`, `whatsapp_username`, `organization_id`, and `@custom_field_slug`. Anything else is refused before the request leaves us, because RD answers an unknown filter by returning everything.
- **It is not atomic.** Under the hood it is a search followed by a write, so two callers upserting the same new record at the same moment can both create one. No CRM in this catalog offers a natural-key constraint to lean on.

To look without writing:

```bash
curl "https://app.openipaas.com/api/unified/v1/contacts/search?field=email&value=ana@exemplo.com.br" \
  -H "Authorization: Bearer oip_live_..." -H "X-Provider: RD_STATION_CRM"
```

## Knowing what a provider can do

Not every provider does everything, and the API tells you rather than failing late:

```bash
curl https://app.openipaas.com/api/unified/v1/providers \
  -H "Authorization: Bearer oip_live_..."
```

Each entry carries a capability matrix: which resources exist and which operations are supported on them. A call to an operation a provider lacks returns `501 NOT_SUPPORTED` before any upstream request is made, so it costs nothing and never half-completes.

The same matrix is rendered in the API reference at `/docs`.

## How much you may call

Two budgets, both per minute, both counted across every instance when Redis is configured:

- **Per client**, 600 requests by default. The whole company, whatever it calls with.
- **Per key**, half of that by default, inside the client one. A key can be given its own limit when it is
  issued through the [admin API](ADMIN.md).

The second exists because one client often has two callers with opposite shapes: a sync that walks every page and
an agent that asks one question. On a single counter the sync starves the agent, and what the person sees is a
slow product with nothing in the logs to blame. Give each caller its own key and they stop competing.

A `429` carries `Retry-After`, `X-RateLimit-Limit` and `X-RateLimit-Scope`, which is `key` or `client` and says
which budget ran out: one is fixed by spreading the work, the other by asking for a bigger allowance.

## Errors

Every error carries a stable `code` and a `requestId`, also returned in the `X-Request-Id` header. Quote the `requestId` when reporting a problem: it is how a specific call is found in the logs. Upstream payloads are logged, never returned, so provider error text cannot leak customer data into your application.

| Code | Meaning | What to do |
|---|---|---|
| `UNAUTHORIZED` | Bad or revoked key, or a connection token that does not belong to the client | Check both headers |
| `AMBIGUOUS_CONNECTION` | `X-Provider` named a service the client has more than one account on | Pick one from the `connections` array in the body and resend with `X-Account-Token` |
| `FORBIDDEN` | The key is valid, but its scopes do not cover this call | Use a key with the right scope; the message says what this one can do |
| `INVALID_REQUEST` | The body or parameters did not validate | Read `error`, fix the call |
| `NOT_FOUND` | No such record on the provider | |
| `NOT_SUPPORTED` | The provider lacks this operation | Check the capability matrix, branch in your code |
| `RATE_LIMITED` | Too many requests, ours or the provider's | Back off and retry; read `X-RateLimit-Scope` to see whether it was this key or the whole client |
| `TOKEN_EXPIRED` | The connection needs reauthorizing | Reconnect the account in the dashboard |
| `UPSTREAM_ERROR` / `UPSTREAM_TIMEOUT` | The provider failed or did not answer | Retry with the same `Idempotency-Key` |
| `CONFIG_ERROR` | The deployment is missing a credential or setting | For the operator, not the caller |

Retries are worth it for `RATE_LIMITED`, `UPSTREAM_ERROR` and `UPSTREAM_TIMEOUT`. The other codes will fail again the same way.

## Passthrough

The unified model will never cover every field of every provider. Anything it misses is still reachable, with the account's credentials, authentication and throttling handled for you:

```bash
curl "https://app.openipaas.com/api/unified/v1/passthrough/contacts?page[size]=5" \
  -H "Authorization: Bearer oip_live_..." \
  -H "X-Provider: RD_STATION_CRM"
```

The path after `/passthrough/` is appended to the provider's base URL and the raw provider response comes back untouched. That response is provider-shaped: it changes when you point the same code at a different provider. Use passthrough for the gaps, not as the default.

## Using it from an AI agent

The same deployment is an MCP server at `/api/mcp`, so a model can use a connected account directly instead of you writing a client for it.

```bash
claude mcp add --transport http ladigroup https://app.openipaas.com/api/mcp \
  --header "Authorization: Bearer oip_live_..."
```

One entry per client: the key decides whose data it is, and the agent sees every system that client has connected.

Any MCP client that speaks Streamable HTTP and can send headers works the same way.

The tools are built from the connected account's capability matrix, not written per provider. An RD Station account offers `list_contacts`, `get_contact`, `search_contacts`, `create_contact`, `upsert_contact`, `list_companies`, `list_deals`, `create_deal`, `list_pipelines` and `passthrough`. A Conta Azul account offers customers, products and sales instead, through the same endpoint. Ask the client to list tools rather than assuming a name exists.

Conventions worth knowing when you read a transcript:

- **Lists are paged.** A tool returns `hasMore` and `nextCursor`; the model passes the cursor back as `cursor`.
- **Writes take a `data` object** holding unified fields, the same ones the REST route accepts.
- **A failed call comes back as a readable result**, not a transport error, so the model can correct itself and try again. Provider detail stays in the logs; the model sees the code, the safe message and a request id.
- **Read and destructive tools are annotated**, so a client that asks for confirmation before acting knows which is which.

Sent with only the key, the server covers every connection of that client and each tool name starts with its service, as in `rd_station_crm__list_contacts`. Adding `X-Provider` or `X-Account-Token` narrows it to that one connection with plain tool names. Either way a key reaches its own client and nothing else. `docs/MCP.md` has the details.

## Being told when a connection breaks

A token expires, a customer revokes access, somebody disconnects an account. Without webhooks you find out when
your next call fails, which is usually in front of a user. Register an endpoint in the dashboard, under
**Webhooks**, and pick the events:

| Event | When |
|---|---|
| `connection.connected` | An account was connected, or reconnected after expiring |
| `connection.expired` | A connection stopped working and needs reauthorizing. At most one per connection per hour while it stays broken |
| `connection.disconnected` | A connection was removed. Calls naming it fail from now on |

Those are all of them. An event that is not in that table is not emitted, so nothing else is worth subscribing to
yet.

The body is the same vocabulary as `GET /connections`:

```json
{
  "id": "d3f1...",
  "type": "connection.expired",
  "createdAt": "2026-09-22T14:02:11.000Z",
  "data": {
    "connectionId": "1f0a...",
    "service": "RD_STATION_CRM",
    "serviceName": "RD Station CRM",
    "label": "RD Station CRM",
    "reason": "The RD Station CRM session expired. Please reconnect the account."
  }
}
```

Every delivery carries `X-OpenIpaas-Timestamp` and `X-OpenIpaas-Signature`, an HMAC-SHA256 over
`timestamp.body` with the signing secret you were shown once when creating the endpoint. Verify it before trusting
the body, and reject a timestamp more than a few minutes old:

```js
import crypto from 'crypto'

const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
```

Answer 2xx to accept. Anything else is retried with backoff, roughly at one minute, five, twenty five, two hours
and ten hours, then given up on. Deliveries and their failures are visible on the Webhooks page.

## Provider notes

### RD Station CRM

Base URL `https://api.rd.services/crm/v2`. Unified resources: contacts, companies, deals, pipelines.

- **Companies are `organizations` upstream.** The unified `companyId` on a contact or a deal is an organization id.
- **`document` (CNPJ) is read only.** It lives in a custom field whose slug differs per account, so it is read where present and never written.
- **Deals join a funnel through their stage.** `pipelineId` is read only; send `stageId` on create. `GET /pipelines` returns each pipeline with its stages in order, which is where a stage id comes from.
- **A deal's `amount`** is the total where RD reports one, otherwise the sum of its recurring and one-off prices. A deal with no value has `amount: null`, which is not zero.
- **Status vocabulary**: RD's `won` and `lost` map to `WON` and `LOST`; `ongoing` and `paused` are both `OPEN`. Anything unrecognized is `UNKNOWN` rather than a guess.
- **Owner and stage names** come from the account's users and pipelines, fetched once per request batch and cached. If the connected user cannot read them, ids still come back and only the names are null.
- **Rate limit**: 120 requests per minute per account, which the platform throttles to on your behalf.

### Conta Azul, Omie, Tiny

Accounting and ERP providers, covering customers, products and sales to varying degrees. Check `/providers` for the exact matrix rather than assuming: it is generated from the code and cannot drift.

## Nothing to read yet

A brand new trial account is empty, and an empty list looks identical to a broken integration. Fill it with obviously fake data first:

```bash
npm run seed:crm -- --api-key oip_live_... --account-token 0f5a...
```

That prints the plan and writes nothing. Add `--confirm` to write. Every record it creates is named with a `[sandbox]` marker so you can find and delete it later. Point it at a trial account, never at one with real customers in it.
