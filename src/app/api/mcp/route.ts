import { NextRequest, NextResponse } from 'next/server';

import { withUnifiedAuth, UnifiedAuthContext } from '@/lib/api-auth';
import { JSONRPC_ERRORS, failure, isNotification, parseMessage } from '@/lib/mcp/protocol';
import { dispatch } from '@/lib/mcp/server';

/**
 * Remote MCP server over the unified API.
 *
 * A model connects with the same two headers any other client sends, and gets
 * tools built from whatever the connected account can do. No tool is written
 * per provider: connect an RD Station account and the model can list contacts
 * and create deals; connect a Conta Azul account and the same endpoint offers
 * customers, products and sales instead.
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

async function handler(_req: NextRequest, auth: UnifiedAuthContext) {
  const parsed = parseMessage(auth.body);

  if ('error' in parsed) {
    return NextResponse.json(failure(null, JSONRPC_ERRORS.INVALID_REQUEST, parsed.error), { status: 400 });
  }

  const { message } = parsed;

  // A notification gets no answer. Anything else is a protocol violation the
  // client is entitled to complain about.
  if (isNotification(message)) return new NextResponse(null, { status: 202 });

  const response = await dispatch(message, {
    requestId: auth.requestId,
    clientName: auth.client.name,
    provider: auth.provider,
    credentials: auth.credentials,
  });

  return NextResponse.json(response, { status: 200 });
}

export const POST = withUnifiedAuth(handler);

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
