import { NextRequest, NextResponse } from 'next/server';

import { withUnifiedAuth, withClientAuth, UnifiedAuthContext, ClientAuthContext } from '@/lib/api-auth';
import { JSONRPC_ERRORS, failure, isNotification, parseMessage } from '@/lib/mcp/protocol';
import { dispatch, type McpContext } from '@/lib/mcp/server';
import { connectionLabel, prefixesFor } from '@/lib/mcp/connections';
import { findManifest } from '@/lib/providers/core/manifests';

/**
 * Remote MCP server over the unified API.
 *
 * A model connects with the same headers any other client sends, and gets tools
 * built from whatever the connected accounts can do. No tool is written per
 * provider: connect an RD Station account and the model can list contacts and
 * create deals; connect a Conta Azul account and the same endpoint offers
 * customers, products and sales instead.
 *
 * Two scopes, chosen by whether X-Account-Token is sent:
 *
 *   with it     one connection, tools named plainly: `list_contacts`
 *   without it  the whole client, tools named per account:
 *               `rd_station_crm__list_contacts`
 *
 * The client scope grants nothing the key did not already have, since an API key
 * already reaches any connection of its own client. It saves running one server
 * entry per connected account, and lets a model work across a client's systems
 * in one conversation.
 *
 * Transport is Streamable HTTP: a POST carrying one JSON-RPC message, answered
 * with a JSON body. Nothing is streamed and no session is kept, so a request
 * carries everything it needs and any instance can serve it.
 *
 * Add it to a client with, for example:
 *   claude mcp add --transport http openipaas https://app.openipaas.com/api/mcp \
 *     --header "Authorization: Bearer oip_live_..." \
 *     --header "X-Account-Token: ..."
 */

async function answer(ctx: McpContext, body: unknown) {
  const parsed = parseMessage(body);

  if ('error' in parsed) {
    return NextResponse.json(failure(null, JSONRPC_ERRORS.INVALID_REQUEST, parsed.error), { status: 400 });
  }

  const { message } = parsed;

  // A notification gets no answer. Anything else is a protocol violation the
  // client is entitled to complain about.
  if (isNotification(message)) return new NextResponse(null, { status: 202 });

  return NextResponse.json(await dispatch(message, ctx), { status: 200 });
}

/** One connection: the tool names stay exactly as they were. */
const connectionScope = withUnifiedAuth(async (_req: NextRequest, auth: UnifiedAuthContext) =>
  answer(
    {
      requestId: auth.requestId,
      clientName: auth.client.name,
      scope: 'connection',
      connections: [
        {
          provider: auth.provider,
          credentials: auth.credentials,
          prefix: '',
          label: connectionLabel(auth.provider.manifest.name, auth.linkedAccount.label),
        },
      ],
    },
    auth.body
  )
);

/** Every connection this client has, each tool carrying the one it belongs to. */
const clientScope = withClientAuth(async (_req: NextRequest, auth: ClientAuthContext) => {
  const prefixes = prefixesFor(
    auth.connections.map((connection) => ({
      id: connection.linkedAccount.id,
      providerSlug: connection.linkedAccount.provider,
    }))
  );

  return answer(
    {
      requestId: auth.requestId,
      clientName: auth.client.name,
      scope: 'client',
      connections: auth.connections.map((connection, index) => ({
        provider: connection.provider,
        credentials: connection.credentials,
        prefix: prefixes[index],
        label: connectionLabel(
          findManifest(connection.linkedAccount.provider)?.name ?? connection.linkedAccount.provider,
          connection.linkedAccount.label
        ),
      })),
    },
    auth.body
  );
});

export async function POST(req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }) {
  // Naming a connection, by token or by service, narrows the server to it.
  const pinned = req.headers.get('X-Account-Token') || req.headers.get('X-Provider');
  return pinned ? connectionScope(req, routeCtx) : clientScope(req);
}

/**
 * Streamable HTTP allows a GET that opens a server-to-client stream. This server
 * never initiates anything, so saying so beats holding a socket open.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'This MCP server does not stream. Send JSON-RPC over POST.', code: 'INVALID_REQUEST' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
