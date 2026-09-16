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
import { bindingFor, callArgs, toolsFor } from './tools';

/**
 * The MCP conversation, with no HTTP in it.
 *
 * Everything the server decides happens here, so the whole protocol can be
 * exercised against a fake provider: which tools an account offers, what a
 * failed call looks like to a model, what an unknown method answers. The route
 * is left with authentication and one JSON body.
 */

export const SERVER_INFO = { name: 'openipaas', title: 'Open IpaaS', version: '1.0.0' };

export interface McpContext {
  requestId: string;
  clientName: string;
  provider: UnifiedProvider;
  credentials: ProviderContext;
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

async function callTool(ctx: McpContext, params: Record<string, unknown> | undefined) {
  const name = params?.name;
  const args = (params?.arguments ?? {}) as Record<string, unknown>;

  if (typeof name !== 'string') {
    return { error: { code: JSONRPC_ERRORS.INVALID_PARAMS, message: 'tools/call requires a tool name' } };
  }

  const manifest = ctx.provider.manifest;
  const binding = bindingFor(manifest, name);
  if (!binding) {
    // Unknown to this account, which for a capability-derived tool list is the
    // same thing as unknown to this server.
    return {
      error: {
        code: JSONRPC_ERRORS.INVALID_PARAMS,
        message: `${manifest.name} has no tool named "${name}". Call tools/list to see what this account offers.`,
      },
    };
  }

  const method = (ctx.provider as unknown as Record<string, unknown>)[binding.method];
  if (typeof method !== 'function') {
    return { payload: toolFailure(`${manifest.name} declares ${name} but does not implement it.`) };
  }

  try {
    const payload = await (method as (...a: unknown[]) => Promise<unknown>).apply(ctx.provider, [
      ctx.credentials,
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

export async function dispatch(message: JsonRpcRequest, ctx: McpContext): Promise<JsonRpcResponse> {
  switch (message.method) {
    case 'initialize':
      return result(message.id, {
        protocolVersion: negotiateVersion(message.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          `Connected to ${ctx.provider.manifest.name} through Open IpaaS, on behalf of ${ctx.clientName}. ` +
          'Tools come from what this account actually supports, so call tools/list before assuming one exists. ' +
          'Lists are paged: pass the returned nextCursor back as cursor to continue.',
      });

    case 'ping':
      return result(message.id, {});

    case 'tools/list':
      return result(message.id, { tools: toolsFor(ctx.provider.manifest) });

    case 'tools/call': {
      const outcome = await callTool(ctx, message.params);
      return outcome.error
        ? failure(message.id, outcome.error.code, outcome.error.message)
        : result(message.id, outcome.payload);
    }

    default:
      return failure(message.id, JSONRPC_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${message.method}`);
  }
}
