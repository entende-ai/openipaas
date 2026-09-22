# Admin API

Creating a client and issuing its key were a person in the dashboard. This is the same two steps as a call, so
that "a new company signed up" can be a step in your own product.

- [The credential](#the-credential)
- [Provisioning a company](#provisioning-a-company)
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

## Endpoints

| Method | Path | What it does |
|---|---|---|
| `GET` | `/clients` | Every client, with its connection and active key counts |
| `POST` | `/clients` | Creates one. `{ "name": "..." }` |
| `GET` | `/clients/{id}` | One client, with its connections in the shape `GET /connections` uses |
| `PATCH` | `/clients/{id}` | Renames it |
| `GET` | `/clients/{id}/keys` | Its keys: prefix, name, scopes, when issued, when last used, when revoked |
| `POST` | `/clients/{id}/keys` | Issues one. `{ "name": "...", "scopes": ["read:contacts"] }`. Answers with the key, once |
| `POST` | `/keys/{id}` | Rotates: issues a replacement with the same name and scopes, and revokes this one, in one transaction |
| `DELETE` | `/keys/{id}` | Revokes. Revoking an already revoked key is not an error |
| `GET` | `/clients/{id}/webhooks` | Its endpoints |
| `POST` | `/clients/{id}/webhooks` | Registers one. `{ "url": "https://...", "events": [...] }`. Answers with the signing secret, once |

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
- **Connect a provider account.** Connecting is an OAuth consent or a set of provider credentials, which belongs to
  the customer, not to your backend.
- **Reach an agent.** The MCP server is built from a client's key and never sees an admin key, so nothing here is
  exposed as a tool.
