import { openApiSpec } from '@/lib/openapi';
import { toolName, toolsFor } from './tools';
import { PREFIX_SEPARATOR } from './connections';
import type { McpConnection, McpContext } from './server';
import type { Operation, ProviderManifest, ResourceName } from '@/lib/providers/core/types';

/**
 * The documentation, served through the same connection as the tools.
 *
 * A model that can call a tool still has to know what the answers mean: that a
 * list is a page, that nextCursor is how you continue, that totalItems is
 * absent rather than null on providers that cannot count, that passthrough
 * exists for the parts of an upstream API this platform has not unified. That
 * knowledge used to live in a guide a person had to paste in.
 *
 * Every word of it is generated from the connected accounts' own manifests, so
 * a new provider gets correct documentation the day it is added, and a fork
 * with providers we have never seen gets it too.
 */

export interface McpResource {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export const GUIDE_URI = 'openipaas://guide';
export const CAPABILITIES_URI = 'openipaas://capabilities';
export const OPENAPI_URI = 'openipaas://openapi.json';

export function providerUri(key: string): string {
  return `openipaas://provider/${key}`;
}

/** A connection's own key: its prefix without the separator, or its slug. */
export function connectionKey(connection: McpConnection): string {
  return connection.prefix
    ? connection.prefix.slice(0, -PREFIX_SEPARATOR.length)
    : connection.provider.manifest.slug;
}

export function resourcesFor(ctx: McpContext): McpResource[] {
  const notes = ctx.connections.map((connection) => ({
    uri: providerUri(connectionKey(connection)),
    name: connectionKey(connection),
    title: `${connection.label} notes`,
    description: `What is specific to ${connection.label}: its own documentation, its limits, and the paths worth calling through passthrough.`,
    mimeType: 'text/markdown',
  }));

  return [
    {
      uri: GUIDE_URI,
      name: 'guide',
      title: ctx.scope === 'client' ? `How to work with ${ctx.clientName}` : 'How to work with this account',
      description:
        'Start here. What this connection is, how paging and errors work, and when to use passthrough instead of a unified tool.',
      mimeType: 'text/markdown',
    },
    {
      uri: CAPABILITIES_URI,
      name: 'capabilities',
      title: 'What these accounts support',
      description: 'The resource and operation matrix behind the tool list, and the tool name for each pair.',
      mimeType: 'application/json',
    },
    ...notes,
    {
      uri: OPENAPI_URI,
      name: 'openapi',
      title: 'Unified API specification',
      description: 'The OpenAPI document for the HTTP API behind these tools, for work outside this connection.',
      mimeType: 'application/json',
    },
  ];
}

/** One connection's matrix, with the tool that serves each pair. */
function matrixFor(manifest: ProviderManifest, prefix: string) {
  return Object.entries(manifest.capabilities).map(([resource, operations]) => ({
    resource,
    operations: (operations as readonly Operation[]).map((operation) => ({
      operation,
      tool: `${prefix}${toolName(resource as ResourceName, operation)}`,
    })),
  }));
}

function capabilitiesPayload(ctx: McpContext) {
  // Anything not listed is not a gap in the tools: the provider does not have
  // it, or this platform has not unified it yet.
  const unsupportedBehaviour = 'A resource or operation that is absent is absent from the tool list too.';

  if (ctx.scope === 'connection') {
    const { manifest } = ctx.connections[0].provider;

    return {
      provider: { slug: manifest.slug, name: manifest.name, category: manifest.category },
      resources: matrixFor(manifest, ''),
      passthrough: manifest.passthrough,
      unsupportedBehaviour,
    };
  }

  return {
    client: ctx.clientName,
    connections: ctx.connections.map((connection) => ({
      toolPrefix: connection.prefix,
      provider: {
        slug: connection.provider.manifest.slug,
        name: connection.provider.manifest.name,
        category: connection.provider.manifest.category,
      },
      label: connection.label,
      resources: matrixFor(connection.provider.manifest, connection.prefix),
      passthrough: connection.provider.manifest.passthrough,
    })),
    unsupportedBehaviour,
  };
}

/** The reading and writing rules, which do not vary by provider. */
function contractSection(ctx: McpContext): string[] {
  // Only said where some connection has them, because an agent told about a
  // field it will never see goes looking for it.
  const hasCustomFields = ctx.connections.some((connection) => (connection.provider.manifest.customFields?.length ?? 0) > 0);

  return [
    '## Reading',
    '',
    '- A list tool answers with `items`, `hasMore` and `nextCursor`. To continue, pass `nextCursor` back as `cursor`.',
    '- `totalItems` is **absent**, not null, on providers that cannot count a result set. Never treat its absence as zero, and rely on `hasMore` to decide whether to keep going.',
    '- `limit` is capped at 200. Asking for more is not an error and does not get you more.',
    '- Where a list tool takes `updatedAfter`, it is an ISO-8601 instant and only records changed since then come back. That is how you follow up on a list you already have. A tool without that argument cannot do it: its provider does not offer the filter, and sending it anyway is refused rather than quietly ignored.',
    '- A `get` tool takes the `id` a list returned. Ids belong to the provider, and they are stable.',
    ...(hasCustomFields
      ? [
          "- `customFields` carries the columns the account added itself, which is usually where the work actually is. `key` is the provider's own identifier, unnormalized, so it may contain hyphens; `label` is null unless the provider says what the field is called; `value` is a string, with a multi-select joined by `, `, or null. An empty list means this record has none. The field being absent means the provider has no such concept.",
        ]
      : []),
    '- A money field is `null` when the provider records no value, and `null` is not zero. Do not read a missing amount as an amount of nothing, and do not sum nulls into a total as if they were zeros.',
    '',
    '## Writing',
    '',
    '- Only the fields the provider accepts are written. Unknown fields are ignored rather than rejected, so a write that silently did nothing is worth reading back.',
    '- An `upsert` tool, where one exists, matches on a field you name and either creates or updates. It refuses to guess: if the match finds more than one record, it fails instead of picking one.',
    '- An `update` is partial. Send the fields you are changing, not the whole record.',
    '',
    '## When a call fails',
    '',
    'A failed tool call comes back as a result with `isError`, not as a protocol error, carrying a code and a short',
    'message. The upstream detail stays in the server log with a request id. Read the message before retrying: a',
    'refused write usually means the provider wants a field this platform did not send, and the fix is `passthrough`,',
    'not a retry.',
    '',
  ];
}

function passthroughSection(connection: McpConnection): string[] {
  const { manifest } = connection.provider;
  if (!manifest.passthrough) return [];

  const lines = [
    `### ${connection.label}: passthrough`,
    '',
    `\`${connection.prefix}passthrough\` calls ${manifest.name}'s own API under the same credentials, for the parts of`,
    'it this platform has not unified. You give a method and a path; the response is whatever the provider sends,',
    'unchanged and unnormalized. Prefer a unified tool when one exists, because only those are stable across providers.',
    '',
  ];

  if (manifest.passthroughExamples?.length) {
    lines.push('Paths worth knowing:', '');
    for (const example of manifest.passthroughExamples) lines.push(`- \`${example.path}\` ${example.label}`);
    lines.push('');
  }

  return lines;
}

function guide(ctx: McpContext): string {
  const lines: string[] = [];

  if (ctx.scope === 'client') {
    lines.push(
      `# Working with ${ctx.clientName} through Open IpaaS`,
      '',
      `This server covers every account connected for **${ctx.clientName}**, and nothing outside it. Each tool name`,
      'starts with the account it belongs to, so a call reaches that account and no other, and the same resource on',
      'two systems can never be confused for one.',
      '',
      '## The accounts on this connection',
      ''
    );

    if (ctx.connections.length === 0) {
      lines.push('None yet. Connect a provider account in the dashboard and its tools appear here.', '');
    }

    for (const connection of ctx.connections) {
      const resources = Object.keys(connection.provider.manifest.capabilities);
      lines.push(
        `- **${connection.label}**, tools prefixed \`${connection.prefix}\`. ` +
          (resources.length > 0 ? `Unified resources: ${resources.join(', ')}.` : 'No unified resources.') +
          (connection.provider.manifest.passthrough ? ' Has passthrough.' : '')
      );
    }
    lines.push('');
  } else {
    const only = ctx.connections[0];
    const resources = Object.keys(only.provider.manifest.capabilities);

    lines.push(
      `# Working with ${only.label} through Open IpaaS`,
      '',
      `This connection acts for **${ctx.clientName}**, against one connected ${only.provider.manifest.name} account.`,
      'Every tool call reaches that account and no other, so there is no customer or tenant to pass: the credentials',
      'the connection was opened with decide whose data this is.',
      '',
      '## The tools you have are the tools this account has',
      '',
      resources.length > 0
        ? `Unified resources here: ${resources.join(', ')}. Call \`tools/list\` rather than assuming a tool exists; the list is built from what ${only.provider.manifest.name} actually supports, so it differs between providers and can grow when a provider gains a capability.`
        : `This account exposes no unified resources${only.provider.manifest.passthrough ? ', so the raw API through `passthrough` is the way in' : ''}.`,
      ''
    );
  }

  lines.push(...contractSection(ctx));

  const passthrough = ctx.connections.flatMap(passthroughSection);
  if (passthrough.length > 0) lines.push('## Passthrough', '', ...passthrough);

  const tools = ctx.connections.flatMap((connection) => toolsFor(connection.provider.manifest, connection.prefix));

  lines.push(
    '## Where the rest is',
    '',
    `- \`${CAPABILITIES_URI}\` the same matrix as JSON, with the tool name for every pair.`,
    ...ctx.connections.map(
      (connection) => `- \`${providerUri(connectionKey(connection))}\` what is specific to ${connection.label}.`
    ),
    `- \`${OPENAPI_URI}\` the HTTP API behind these tools, for work outside this connection.`,
    '',
    `You have ${tools.length} ${tools.length === 1 ? 'tool' : 'tools'} on this connection.`
  );

  return lines.join('\n');
}

function providerNotes(connection: McpConnection): string {
  const { manifest } = connection.provider;

  const lines = [
    `# ${connection.label}`,
    '',
    manifest.description,
    '',
    `- Category: ${manifest.category}`,
    `- Authentication: ${manifest.auth.type}, held and refreshed by Open IpaaS. You never see a provider token.`,
    `- Upstream base URL: ${manifest.baseUrl}`,
  ];

  if (connection.prefix) lines.push(`- Tools for this account start with \`${connection.prefix}\`.`);

  if (manifest.rateLimit) {
    lines.push(
      `- Rate limit: this platform throttles itself to ${manifest.rateLimit.requestsPerSecond} requests per second per connected account${
        manifest.rateLimit.burst ? `, bursting to ${manifest.rateLimit.burst}` : ''
      }. Sustained loops will be slowed rather than refused.`
    );
  }

  if (manifest.incremental?.length) {
    lines.push(`- Takes \`updatedAfter\` on: ${manifest.incremental.join(', ')}. Anywhere else it is refused, not ignored.`);
  }

  if (manifest.customFields?.length) {
    lines.push(
      `- Carries \`customFields\`, the account's own columns, on: ${manifest.customFields.join(', ')}.`
    );
  }

  if (manifest.docsUrl) lines.push(`- Provider documentation: ${manifest.docsUrl}`);

  lines.push(
    '',
    manifest.passthrough
      ? `The raw ${manifest.name} API is reachable through the \`${connection.prefix}passthrough\` tool, so anything missing from the unified tools is still one call away.`
      : `This provider has no passthrough: the unified tools are the whole surface.`
  );

  return lines.join('\n');
}

/**
 * The contents of one resource, or null when the uri is not one of ours.
 *
 * Nothing here reads the filesystem. A guide shipped as a file would be a file
 * the standalone build does not carry, and a guide pasted into a string would
 * be a second copy to keep true.
 */
export function readResource(uri: string, ctx: McpContext): { mimeType: string; text: string } | null {
  if (uri === GUIDE_URI) return { mimeType: 'text/markdown', text: guide(ctx) };

  if (uri === CAPABILITIES_URI) {
    return { mimeType: 'application/json', text: JSON.stringify(capabilitiesPayload(ctx), null, 2) };
  }

  if (uri === OPENAPI_URI) return { mimeType: 'application/json', text: JSON.stringify(openApiSpec, null, 2) };

  const connection = ctx.connections.find((entry) => providerUri(connectionKey(entry)) === uri);
  if (connection) return { mimeType: 'text/markdown', text: providerNotes(connection) };

  return null;
}
