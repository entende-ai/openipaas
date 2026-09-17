import { openApiSpec } from '@/lib/openapi';
import { toolName, toolsFor } from './tools';
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
 * Every word of it is generated from the connected account's own manifest, so
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

export interface ResourceContext {
  manifest: ProviderManifest;
  /** The API consumer the account token belongs to, named in the guide. */
  clientName: string;
}

export const GUIDE_URI = 'openipaas://guide';
export const CAPABILITIES_URI = 'openipaas://capabilities';
export const OPENAPI_URI = 'openipaas://openapi.json';

export function providerUri(slug: string): string {
  return `openipaas://provider/${slug}`;
}

export function resourcesFor(manifest: ProviderManifest): McpResource[] {
  return [
    {
      uri: GUIDE_URI,
      name: 'guide',
      title: 'How to work with this account',
      description:
        'Start here. What this connection is, how paging and errors work, and when to use passthrough instead of a unified tool.',
      mimeType: 'text/markdown',
    },
    {
      uri: CAPABILITIES_URI,
      name: 'capabilities',
      title: 'What this account supports',
      description: 'The resource and operation matrix behind the tool list, and the tool name for each pair.',
      mimeType: 'application/json',
    },
    {
      uri: providerUri(manifest.slug),
      name: manifest.slug,
      title: `${manifest.name} notes`,
      description: `What is specific to ${manifest.name}: its own documentation, its limits, and the paths worth calling through passthrough.`,
      mimeType: 'text/markdown',
    },
    {
      uri: OPENAPI_URI,
      name: 'openapi',
      title: 'Unified API specification',
      description: 'The OpenAPI document for the HTTP API behind these tools, for work outside this connection.',
      mimeType: 'application/json',
    },
  ];
}

/** The matrix, machine readable, with the tool that serves each pair. */
function capabilitiesPayload(manifest: ProviderManifest) {
  const resources = Object.entries(manifest.capabilities).map(([resource, operations]) => ({
    resource,
    operations: (operations as readonly Operation[]).map((operation) => ({
      operation,
      tool: toolName(resource as ResourceName, operation),
    })),
  }));

  return {
    provider: { slug: manifest.slug, name: manifest.name, category: manifest.category },
    resources,
    passthrough: manifest.passthrough,
    // Anything not listed here is not a gap in the tools: the provider does not
    // have it, or this platform has not unified it yet.
    unsupportedBehaviour: 'A resource or operation that is absent is absent from the tool list too.',
  };
}

function guide(ctx: ResourceContext): string {
  const { manifest, clientName } = ctx;
  const tools = toolsFor(manifest);
  const resources = Object.keys(manifest.capabilities);

  const lines = [
    `# Working with ${manifest.name} through Open IpaaS`,
    '',
    `This connection acts for **${clientName}**, against one connected ${manifest.name} account. Every tool call`,
    'reaches that account and no other, so there is no customer or tenant to pass: the credentials the connection',
    'was opened with decide whose data this is.',
    '',
    '## The tools you have are the tools this account has',
    '',
    resources.length > 0
      ? `Unified resources here: ${resources.join(', ')}. Call \`tools/list\` rather than assuming a tool exists; the list is built from what ${manifest.name} actually supports, so it differs between providers and can grow when a provider gains a capability.`
      : `This account exposes no unified resources${manifest.passthrough ? ', so the raw API through `passthrough` is the way in' : ''}.`,
    '',
    '## Reading',
    '',
    '- A list tool answers with `items`, `hasMore` and `nextCursor`. To continue, pass `nextCursor` back as `cursor`.',
    '- `totalItems` is **absent**, not null, on providers that cannot count a result set. Never treat its absence as zero, and rely on `hasMore` to decide whether to keep going.',
    '- `limit` is capped at 200. Asking for more is not an error and does not get you more.',
    '- A `get` tool takes the `id` a list returned. Ids belong to the provider, and they are stable.',
    '',
    '## Writing',
    '',
    '- Only the fields this provider accepts are written. Unknown fields are ignored rather than rejected, so a write that silently did nothing is worth reading back.',
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

  if (manifest.passthrough) {
    lines.push(
      '## Passthrough',
      '',
      `\`passthrough\` calls ${manifest.name}'s own API under the same credentials, for the parts of it this platform`,
      'has not unified. You give a method and a path; the response is whatever the provider sends, unchanged and',
      'unnormalized. Prefer a unified tool when one exists, because only those are stable across providers.',
      ''
    );

    if (manifest.passthroughExamples?.length) {
      lines.push('Paths worth knowing on this provider:', '');
      for (const example of manifest.passthroughExamples) {
        lines.push(`- \`${example.path}\` ${example.label}`);
      }
      lines.push('');
    }
  }

  lines.push(
    '## Where the rest is',
    '',
    `- \`${CAPABILITIES_URI}\` the same matrix as JSON, with the tool name for every pair.`,
    `- \`${providerUri(manifest.slug)}\` what is specific to ${manifest.name}.`,
    `- \`${OPENAPI_URI}\` the HTTP API behind these tools, for work outside this connection.`,
    '',
    `You have ${tools.length} ${tools.length === 1 ? 'tool' : 'tools'} on this connection.`
  );

  return lines.join('\n');
}

function providerNotes(manifest: ProviderManifest): string {
  const lines = [
    `# ${manifest.name}`,
    '',
    manifest.description,
    '',
    `- Category: ${manifest.category}`,
    `- Authentication: ${manifest.auth.type}, held and refreshed by Open IpaaS. You never see a provider token.`,
    `- Upstream base URL: ${manifest.baseUrl}`,
  ];

  if (manifest.rateLimit) {
    lines.push(
      `- Rate limit: this platform throttles itself to ${manifest.rateLimit.requestsPerSecond} requests per second per connected account${
        manifest.rateLimit.burst ? `, bursting to ${manifest.rateLimit.burst}` : ''
      }. Sustained loops will be slowed rather than refused.`
    );
  }

  if (manifest.docsUrl) lines.push(`- Provider documentation: ${manifest.docsUrl}`);

  lines.push(
    '',
    manifest.passthrough
      ? `The raw ${manifest.name} API is reachable through the \`passthrough\` tool, so anything missing from the unified tools is still one call away.`
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
export function readResource(uri: string, ctx: ResourceContext): { mimeType: string; text: string } | null {
  if (uri === GUIDE_URI) return { mimeType: 'text/markdown', text: guide(ctx) };

  if (uri === CAPABILITIES_URI) {
    return { mimeType: 'application/json', text: JSON.stringify(capabilitiesPayload(ctx.manifest), null, 2) };
  }

  if (uri === providerUri(ctx.manifest.slug)) {
    return { mimeType: 'text/markdown', text: providerNotes(ctx.manifest) };
  }

  if (uri === OPENAPI_URI) return { mimeType: 'application/json', text: JSON.stringify(openApiSpec, null, 2) };

  return null;
}
