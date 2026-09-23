# Admin API

Creating a client and issuing its key were a person in the dashboard. This is the same two steps as a call, so
that "a new company signed up" can be a step in your own product.

- [The credential](#the-credential)
- [Provisioning a company](#provisioning-a-company)
- [Connecting an account for a customer](#connecting-an-account-for-a-customer)
- [Endpoints](#endpoints)
- [What it cannot do](#what-it-cannot-do)

## The credential

An admin key, issued in the dashboard on **Clients & keys**, in the **Admin API** card. It starts with
`oip_admin_` and is shown once.

```
Authorization: Bearer oip_admin_...
```

It is a different kind of thing from a client's API key, and the two are never interchangeable. A client key
presented to the admin API is refused exactly like an invented one, and an admin key is not a client key, so it
cannot call the unified API at all. Keep it in a secret manager, one per system that uses it, and revoke it the
moment that system stops needing it. Until one is issued, the admin API answers 401 to everything, which is the
right state for a deployment that does not use it.

Everything below is under `/api/admin/v1`. Errors carry the same `code` and `requestId` the unified API uses.

## Provisioning a company

The four calls a product makes when a customer signs up:

```bash
ADMIN="Authorization: Bearer $OPENIPAAS_ADMIN_KEY"
BASE="https://app.openipaas.com/api/admin/v1"

# 1. The client. Keep the id: it is what your side stores against the company.
CLIENT=$(curl -s -X POST "$BASE/clients" -H "$ADMIN" -H 'Content-Type: application/json' \
  -d '{"name":"Nova Empresa"}' | jq -r .id)

# 2. Its key, scoped to what your integration actually does.
curl -s -X POST "$BASE/clients/$CLIENT/keys" -H "$ADMIN" -H 'Content-Type: application/json' \
  -d '{"name":"Hub","scopes":["read:contacts","read:companies"]}'

# 3. Where to be told when one of its connections breaks.
curl -s -X POST "$BASE/clients/$CLIENT/webhooks" -H "$ADMIN" -H 'Content-Type: application/json' \
  -d '{"url":"https://your-app.com/hooks/openipaas"}'

# 4. What it has connected, which is empty until somebody connects an account.
curl -s "$BASE/clients/$CLIENT" -H "$ADMIN"
```

The key and the signing secret are each in exactly one response and never shown again. Store them before doing
anything else with them.

One client per company, one company per client. The client is the boundary the whole platform rests on: a key
reaches its own client's connections and nothing else, so two companies sharing one client would put the boundary
back in your code, where it has to be maintained.

## Connecting an account for a customer

Provisioning gets you a client with no connections. Filling it used to mean somebody opening this console,
finding the company in a list of every company in the deployment, and finishing the provider's consent screen
themselves. That is fine for one customer and impossible for a hundred, and it is not something you can ask an
end customer to do: the console is yours, and what they would see there is everyone else's business.

A **connect session** is a one-time link you create for one of your customers. They open it, approve their own
provider account, and never see anything of this platform but one screen that can be made to look like yours.

```bash
curl -s -X POST "$BASE/clients/$CLIENT/connect-sessions" -H "$ADMIN" -H 'Content-Type: application/json' -d '{
  "provider": "RD_STATION_CRM",
  "redirectUrl": "https://your-app.com/settings/integrations/done",
  "origins": ["https://your-app.com"],
  "label": "Your Product",
  "logoUrl": "https://your-app.com/logo.svg",
  "accentColor": "#2563eb"
}'
```

```json
{
  "id": "aae7031f-...",
  "token": "eyJzaWQiOiJ...",
  "url": "https://app.openipaas.com/connect/eyJzaWQiOiJ...",
  "expiresAt": "2026-09-23T01:37:47.242Z",
  "expiresInSeconds": 1800,
  "frameableBy": ["https://your-app.com"]
}
```

Every field but the client is optional:

| Field | What it does |
|---|---|
| `provider` | Pins one service, so the page opens straight into it. Left out, the customer picks from what this deployment supports |
| `redirectUrl` | Where the browser goes when it is over, with `status`, `session` and, on success, `connection` in the query |
| `origins` | The only origins allowed to frame the page and receive its messages. Required if you embed it |
| `label`, `logoUrl`, `accentColor` | Your product's name, mark and button colour on the page |

### Showing it

Three ways, in the order they are worth trying:

- **In an iframe**, at `url`, when `origins` names your own origin. The customer never leaves your settings page.
- **In a new tab or a popup**, at `url`, which needs no `origins` at all.
- **In an email or a message**, when the person who has the provider account is not the person configuring your
  product. This is common, and is the reason the link stands on its own.

However it is shown, the page posts a message to each origin you named when it finishes:

```js
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://app.openipaas.com') return
  if (event.data?.type !== 'openipaas:connect') return
  // event.data.status is connected, cancelled, failed or used
  // event.data.connection is the connection id, on success
})
```

Do not rely on the message alone. A browser that blocks third-party frames, an in-app webview, or a customer who
finishes the link on their phone will never deliver it. `redirectUrl` covers the second case and the webhook
covers all of them: a client with an endpoint registered gets `connection.connected` with the same connection id,
which is the only report that does not depend on a browser still being open.

### What the link can and cannot do

- It is **single use**. The second submission on the same link is refused, and two tabs racing produce one
  connection, not two.
- It **expires in 30 minutes**. Create it when the customer clicks, not when the page loads.
- It is the **authority to attach an account to exactly one client**, and to nothing else. It reads no data,
  reaches no other client, and cannot be pointed at a service the session did not name.
- It is **stored hashed**, so a copy of the database is not a set of live links.
- It is **frameable only by the origins you named**, through a per-session `frame-ancestors`. Name none and it
  cannot be framed at all.

Because the link is the whole authority, treat it like a password reset link: send it to the customer, not
through a third party, and create a new one rather than reusing an old one.

## Endpoints

| Method | Path | What it does |
|---|---|---|
| `GET` | `/clients` | Every client, with its connection and active key counts |
| `POST` | `/clients` | Creates one. `{ "name": "..." }` |
| `GET` | `/clients/{id}` | One client, with its connections in the shape `GET /connections` uses |
| `PATCH` | `/clients/{id}` | Renames it |
| `GET` | `/clients/{id}/keys` | Its keys: prefix, name, scopes, when issued, when last used, when revoked |
| `POST` | `/clients/{id}/keys` | Issues one. `{ "name": "...", "scopes": ["read:contacts"], "rateLimit": 120 }`. Answers with the key, once |
| `POST` | `/keys/{id}` | Rotates: issues a replacement with the same name and scopes, and revokes this one, in one transaction |
| `DELETE` | `/keys/{id}` | Revokes. Revoking an already revoked key is not an error |
| `GET` | `/clients/{id}/webhooks` | Its endpoints |
| `POST` | `/clients/{id}/webhooks` | Registers one. `{ "url": "https://...", "events": [...] }`. Answers with the signing secret, once |
| `GET` | `/clients/{id}/connect-sessions` | The last 50 links handed out for this client, without their tokens |
| `POST` | `/clients/{id}/connect-sessions` | Creates one. Answers with the link, once |
| `GET` | `/connect-sessions/{id}` | One link: whether it was used, when, and which connection it produced |

`rateLimit` is that key budget in requests per minute, inside its client budget. Leave it out for the platform
default, or set a small one for a caller that walks every page so it cannot starve the others on the same client.

Scopes are the same vocabulary the unified API enforces, described in the
[integration guide](INTEGRATION.md#what-a-key-may-do). Asking for a scope list that cannot be read is a 400 rather
than a silent fall back to full access.

Rotation is one call on purpose. Issuing and revoking separately leaves a window where either both keys work or
neither does, depending on the order, and whichever order you pick will sometimes be the wrong one.

## What it cannot do

- **Read anyone's business data.** It never reaches a provider: contacts, sales and the rest still need that
  client's own key. An admin key that leaks is bad in a different way than a client key that leaks, and knowing
  which way matters at three in the morning.
- **Delete a client.** That would take its keys, connections and request history with it, and a program that can do
  that by accident is a program that eventually will. Revoke the keys here; let a person finish the job in the
  dashboard.
- **Connect a provider account itself.** Connecting is an OAuth consent or a set of provider credentials, which
  belongs to the customer, not to your backend. What it can do is hand that customer a link, which is the whole
  point of [connect sessions](#connecting-an-account-for-a-customer): your backend never holds their credentials,
  and never needs to.
- **Reach an agent.** The MCP server is built from a client's key and never sees an admin key, so nothing here is
  exposed as a tool.
