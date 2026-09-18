# Connecting an AI agent

Open IpaaS is an MCP server. Point an agent at one connection and it gets the
tools that connection actually supports, plus the documentation for them,
generated from the provider's own manifest.

Nothing about this is specific to a provider. Connect an RD Station CRM account
and the agent can list contacts and create deals; connect a Conta Azul account
and the same endpoint offers customers, products and sales instead. A provider
added to a fork gets the same treatment on the day it is added.

## The endpoint, and the two scopes

```
POST <your deployment>/api/mcp
Authorization: Bearer <api key>
X-Account-Token: <account token>      optional
```

The account token is what decides how much the server covers.

**Without it, the server is the client.** Every account that client has
connected is on one server entry, and every tool name starts with the account it
belongs to: `rd_station_crm__list_contacts`, `conta_azul__list_customers`. This
is usually the one you want. An agent working for a customer generally needs
that customer's systems, not one of them.

**With it, the server is that one connection**, and the tool names are plain:
`list_contacts`. Narrower on purpose, for an agent that should reach one system
and not the rest.

Neither grants more than the API key already had: a key reaches any connection
of its own client, and nothing belonging to another client. What the client
scope removes is having to run one server entry per connected account.

The account is part of the tool name rather than an argument because the tools
of two providers are not interchangeable. A single `connection` parameter would
offer a model `list_deals` on an accounting system, and it would find out by
failing. Two accounts on the same provider are told apart by a fragment of the
connection id, which does not move when an unrelated connection is removed.

Transport is Streamable HTTP with no session: every request carries what it
needs, so any instance can serve it. A `GET` is answered with 405, because this
server never initiates anything.

## Setting it up

**Connect an agent** hands you these filled in: on Clients and keys for the
client scope, on Connections for a single connection. By hand:

```bash
export OPENIPAAS_API_KEY="the key you copied when you created it"

# Everything this client has connected
claude mcp add --transport http --scope user ladigroup \
  https://app.openipaas.com/api/mcp \
  --header "Authorization: Bearer $OPENIPAAS_API_KEY"

# Or one connection only
export OPENIPAAS_ACCOUNT_TOKEN="the account token"
claude mcp add --transport http --scope user ladigroup-rd-station-crm \
  https://app.openipaas.com/api/mcp \
  --header "Authorization: Bearer $OPENIPAAS_API_KEY" \
  --header "X-Account-Token: $OPENIPAAS_ACCOUNT_TOKEN"
```

For a repository a team shares, commit `.mcp.json` and leave the values as
variables, so no key is in the commit:

```json
{
  "mcpServers": {
    "ladigroup-rd-station-crm": {
      "type": "http",
      "url": "https://app.openipaas.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ${OPENIPAAS_API_KEY}",
        "X-Account-Token": "${OPENIPAAS_ACCOUNT_TOKEN}"
      }
    }
  }
}
```

Check it answers before involving an agent:

```bash
curl -s https://app.openipaas.com/api/mcp \
  -H "Authorization: Bearer $OPENIPAAS_API_KEY" \
  -H "X-Account-Token: $OPENIPAAS_ACCOUNT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## What the agent gets

**Tools**, one per resource and operation each connected account supports, named
`list_contacts`, `get_contact`, `create_deal` and so on, plus `passthrough`
where the provider allows it, each name carrying its account in a client scope.
A capability the provider does not have is not a
tool, so there is nothing to explain and nothing to guess.

**Resources**, which is the documentation:

| URI | What it is |
| --- | --- |
| `openipaas://guide` | Start here. Written for this account: what the connection is, how paging works, what a failed call means, when to reach for passthrough. |
| `openipaas://capabilities` | The same matrix as JSON, pairing every operation with the tool that serves it. |
| `openipaas://provider/<key>` | One per connected account: what is specific to that provider, its rate limit, the paths worth calling raw. |
| `openipaas://openapi.json` | The OpenAPI document for the HTTP API behind the tools. |

All four are generated at read time from the manifest of whatever provider is
connected. There is no file to keep in step and no copy to go stale.

The server names the guide in its `initialize` instructions, so an agent is told
the documentation exists before it makes its first call.

## What an agent can do with it

Everything the API key can do, including writes. A tool call is an API call:
same authentication, same rate limit, same request log. If that is more than you
want to hand an agent, give it its own API key so you can revoke it on its own,
and check the API logs page, where its calls appear like anyone else's.

A failed tool call comes back as a result marked `isError`, carrying a code and
a short message. The upstream detail stays in the server log with a request id.
That is deliberate: a model should be able to read a failure and decide what to
do, without the provider's internals ending up in a transcript.

## Other clients

Claude Code is what this is tested against. Claude Desktop reaches a remote
server with static headers through the `mcp-remote` bridge rather than directly.

claude.ai custom connectors want OAuth and cannot send a static header, so this
server cannot be added there yet. Supporting it means implementing the MCP
authorization spec, which is a project rather than a setting.

## Running it locally

`npm run dev`, then point the agent at `http://localhost:3000/api/mcp` with a key
and a token from your own dashboard. Everything above works the same; the
snippets in the dashboard use whatever `NEXT_PUBLIC_APP_URL` is set to.
