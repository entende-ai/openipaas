import { isProviderError } from '@/lib/providers/core/errors';
import type { ProviderContext, UnifiedProvider } from '@/lib/providers/core/types';

import {
  JSONRPC_ERRORS,
  failure,
  negotiateVersion,
  result,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './protocol';
import { bindingFor, callArgs, scopeForBinding, toolsFor } from './tools';
import { allows, describeScopes } from '@/lib/scopes';
import { GUIDE_URI, readResource, resourcesFor } from './resources';

/**
 * The MCP conversation, with no HTTP in it.
 *
 * Everything the server decides happens here, so the whole protocol can be
 * exercised against a fake provider: which tools an account offers, what a
 * failed call looks like to a model, what an unknown method answers. The route
 * is left with authentication and one JSON body.
 *
 * A server covers one connection or a whole client. Both are the same code
 * path: a connection is a list of one, with an empty prefix.
 */

export const SERVER_INFO = { name: 'openipaas', title: 'Open IpaaS', version: '1.0.0' };

export interface McpConnection {
  provider: UnifiedProvider;
  credentials: ProviderContext;
  /** Empty when this connection is the whole server, else `slug__`. */
  prefix: string;
  /** How the guide and the tool descriptions name it. */
  label: string;
}

export interface McpContext {
  requestId: string;
  clientName: string;
  /** 'connection' keeps the plain tool names an existing agent already knows. */
  scope: 'connection' | 'client';
  connections: McpConnection[];
  /**
   * What the key behind this server may do. Empty means everything.
   *
   * A scoped key gets a shorter tool list rather than tools that refuse: a model
   * works from what it can see, so a tool it must not use should not be there.
   * The call is checked again anyway, because a list is a suggestion.
   */
  keyScopes: string[];
}

/** A tool failed. That is a result the model can read, not a protocol error. */
function toolFailure(message: string) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function toolSuccess(payload: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    // Clients that understand it get the data without parsing the text back.
    structuredContent: isPlainObject(payload) ? payload : { data: payload },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Which connection a tool name belongs to.
 *
 * With the `__` separator no prefix can start another one (see prefixesFor), so
 * at most one connection matches. Longest first is kept only so that a future
 * naming scheme without that property fails towards the more specific account.
 */
function connectionFor(ctx: McpContext, name: string): McpConnection | null {
  const candidates = ctx.connections
    .filter((connection) => name.startsWith(connection.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  return candidates[0] ?? null;
}

async function callTool(ctx: McpContext, params: Record<string, unknown> | undefined) {
  const name = params?.name;
  const args = (params?.arguments ?? {}) as Record<string, unknown>;

  if (typeof name !== 'string') {
    return { error: { code: JSONRPC_ERRORS.INVALID_PARAMS, message: 'tools/call requires a tool name' } };
  }

  const connection = connectionFor(ctx, name);
  const binding = connection ? bindingFor(connection.provider.manifest, name, connection.prefix) : null;

  if (!connection || !binding) {
    // Unknown to this account, which for a capability-derived tool list is the
    // same thing as unknown to this server.
    const scope = ctx.scope === 'client' ? ctx.clientName : (connection?.label ?? ctx.connections[0]?.label ?? 'this account');
    return {
      error: {
        code: JSONRPC_ERRORS.INVALID_PARAMS,
        message: `${scope} has no tool named "${name}". Call tools/list to see what this connection offers.`,
      },
    };
  }

  // Checked here and not only in tools/list: a model can send a name it was
  // never offered, and passthrough carries its method in the arguments.
  const intent = scopeForBinding(binding, typeof args.method === 'string' ? args.method : 'GET');
  if (!allows(ctx.keyScopes, intent.action, intent.resource)) {
    return {
      payload: toolFailure(
        `FORBIDDEN: this key may not ${intent.action} ${intent.resource}. It can: ${describeScopes(ctx.keyScopes).toLowerCase()}.`
      ),
    };
  }

  const method = (connection.provider as unknown as Record<string, unknown>)[binding.method];
  if (typeof method !== 'function') {
    return { payload: toolFailure(`${connection.label} declares ${name} but does not implement it.`) };
  }

  try {
    const payload = await (method as (...a: unknown[]) => Promise<unknown>).apply(connection.provider, [
      connection.credentials,
      ...callArgs(binding, args),
    ]);
    return { payload: toolSuccess(payload) };
  } catch (error) {
    if (isProviderError(error)) {
      // publicMessage only: upstream detail stays in the logs, exactly as it
      // does on the REST side.
      return { payload: toolFailure(`${error.code}: ${error.publicMessage}`) };
    }
    console.error(`[MCP][${ctx.requestId}] ${name} failed:`, error);
    return { payload: toolFailure(`The call failed. Quote request id ${ctx.requestId} when reporting it.`) };
  }
}

function instructionsFor(ctx: McpContext): string {
  const shared = [
    `Tools come from what ${ctx.scope === 'client' ? 'these accounts actually support' : 'this account actually supports'}, so call tools/list before assuming one exists.`,
    'Lists are paged: pass the returned nextCursor back as cursor to continue.',
    `Read ${GUIDE_URI} before the first call: it is written for this connection and says what the answers mean.`,
  ].join(' ');

  if (ctx.scope === 'client') {
    const names = ctx.connections.map((connection) => connection.label).join(', ');
    return (
      `Connected to Open IpaaS on behalf of ${ctx.clientName}, covering ${ctx.connections.length} ` +
      `${ctx.connections.length === 1 ? 'account' : 'accounts'}: ${names || 'none yet'}. ` +
      'Each tool name starts with the account it belongs to, so a tool reaches that account and no other. ' +
      shared
    );
  }

  const only = ctx.connections[0];
  return `Connected to ${only?.label ?? 'a provider'} through Open IpaaS, on behalf of ${ctx.clientName}. ` + shared;
}

export async function dispatch(message: JsonRpcRequest, ctx: McpContext): Promise<JsonRpcResponse> {
  switch (message.method) {
    case 'initialize':
      return result(message.id, {
        protocolVersion: negotiateVersion(message.params?.protocolVersion),
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
        serverInfo: SERVER_INFO,
        instructions: instructionsFor(ctx),
      });

    case 'ping':
      return result(message.id, {});

    case 'tools/list':
      return result(message.id, {
        tools: ctx.connections.flatMap((connection) =>
          toolsFor(connection.provider.manifest, connection.prefix, ctx.keyScopes)
        ),
      });

    case 'tools/call': {
      const outcome = await callTool(ctx, message.params);
      return outcome.error
        ? failure(message.id, outcome.error.code, outcome.error.message)
        : result(message.id, outcome.payload);
    }

    case 'resources/list':
      return result(message.id, { resources: resourcesFor(ctx) });

    // Templates exist in the protocol and this server has none: every resource
    // it serves has a fixed uri. Answering an empty list beats a client
    // treating METHOD_NOT_FOUND as the server being broken.
    case 'resources/templates/list':
      return result(message.id, { resourceTemplates: [] });

    case 'resources/read': {
      const uri = message.params?.uri;

      if (typeof uri !== 'string') {
        return failure(message.id, JSONRPC_ERRORS.INVALID_PARAMS, 'resources/read requires a uri');
      }

      const contents = readResource(uri, ctx);

      if (!contents) {
        return failure(
          message.id,
          JSONRPC_ERRORS.INVALID_PARAMS,
          `No resource at ${uri}. Call resources/list to see what this connection serves.`
        );
      }

      return result(message.id, { contents: [{ uri, ...contents }] });
    }

    default:
      return failure(message.id, JSONRPC_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${message.method}`);
  }
}
