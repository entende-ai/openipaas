/**
 * The JSON-RPC 2.0 envelope MCP speaks, hand rolled.
 *
 * The protocol surface a server needs is small: initialize, tools/list,
 * tools/call, ping and the initialized notification. Writing those by hand
 * keeps a transitive dependency out of the lockfile, which on this project has
 * been worth more than the convenience.
 *
 * Spec: https://modelcontextprotocol.io/specification
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

/** JSON-RPC reserved codes. Tool failures are results, not these. */
export const JSONRPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  /** Absent on a notification, which must not be answered. */
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function isNotification(message: JsonRpcRequest): boolean {
  return message.id === undefined || message.id === null;
}

/**
 * Validates the envelope only. A malformed one cannot be answered with an id,
 * which is why the id defaults to null in the error response.
 */
export function parseMessage(value: unknown): { message: JsonRpcRequest } | { error: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    // Batches are legal JSON-RPC but were removed from MCP in 2025-06-18, and
    // no client sends them. Rejecting is honest; pretending to support them is not.
    return { error: 'Expected a single JSON-RPC object' };
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.jsonrpc !== '2.0') return { error: 'jsonrpc must be "2.0"' };
  if (typeof candidate.method !== 'string' || candidate.method.length === 0) {
    return { error: 'method is required' };
  }

  const id = candidate.id;
  if (id !== undefined && id !== null && typeof id !== 'string' && typeof id !== 'number') {
    return { error: 'id must be a string, a number or null' };
  }

  const params = candidate.params;
  if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
    return { error: 'params must be an object' };
  }

  return {
    message: {
      jsonrpc: '2.0',
      id: id as string | number | undefined,
      method: candidate.method,
      params: params as Record<string, unknown> | undefined,
    },
  };
}

export function result(id: string | number | null | undefined, payload: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result: payload };
}

export function failure(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

/**
 * Answers with the client's version when we speak it, and with our latest when
 * we do not. The client then decides whether it can live with that.
 */
export function negotiateVersion(requested: unknown): string {
  return typeof requested === 'string' && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}
