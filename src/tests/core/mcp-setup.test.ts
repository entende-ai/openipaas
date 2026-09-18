import { describe, it, expect } from 'vitest';
import {
  claudeCodeCommand,
  curlCheck,
  mcpEndpoint,
  mcpJsonSnippet,
  mcpServerName,
  TOKEN_PLACEHOLDER,
  API_KEY_VARIABLE,
  ACCOUNT_TOKEN_VARIABLE,
  type McpSetup,
} from '@/lib/dashboard/mcp-setup';

/**
 * The snippets the dashboard hands over for connecting an agent.
 *
 * These get pasted into a terminal by someone who cannot debug them, so what is
 * tested here is that they are literally correct: the endpoint, the two header
 * names the API actually checks, and a key that never appears in a file meant
 * to be committed.
 */

const SETUP: McpSetup = {
  appUrl: 'https://app.openipaas.com',
  clientName: 'LadiGroup',
  scope: 'connection',
  providerName: 'RD Station CRM',
  accountToken: 'tok-123',
};

const CLIENT_SETUP: McpSetup = { appUrl: 'https://app.openipaas.com', clientName: 'LadiGroup', scope: 'client' };

describe('the server name', () => {
  it('carries the client and the provider, because both vary', () => {
    expect(mcpServerName('LadiGroup', 'RD Station CRM')).toBe('ladigroup-rd-station-crm');
  });

  it('survives a name a person typed', () => {
    expect(mcpServerName('Açaí & Cia.', 'Conta Azul')).toBe('acai-cia-conta-azul');
    expect(mcpServerName('  ---  ', '')).toBe('openipaas');
  });
});

describe('the endpoint', () => {
  it('is the mcp route on this deployment', () => {
    expect(mcpEndpoint('https://app.openipaas.com')).toBe('https://app.openipaas.com/api/mcp');
  });

  it('does not double the slash when the configured url has one', () => {
    expect(mcpEndpoint('https://app.openipaas.com/')).toBe('https://app.openipaas.com/api/mcp');
  });
});

describe('the claude code command', () => {
  const command = claudeCodeCommand(SETUP);

  it('sends the two headers the api checks, by their real names', () => {
    expect(command).toContain(`--header "Authorization: Bearer $${API_KEY_VARIABLE}"`);
    expect(command).toContain(`--header "X-Account-Token: $${ACCOUNT_TOKEN_VARIABLE}"`);
  });

  it('adds a remote http server, not a local one', () => {
    expect(command).toContain('claude mcp add --transport http');
    expect(command).toContain('https://app.openipaas.com/api/mcp');
  });

  it('fills the token in for whoever is allowed to see it', () => {
    expect(command).toContain('tok-123');
    expect(claudeCodeCommand({ ...SETUP, accountToken: null })).toContain(TOKEN_PLACEHOLDER);
  });

  // The key is stored as a hash, so the platform cannot fill this one in.
  it('leaves the api key to the person, and says so', () => {
    expect(command).toContain('the-key-you-copied-when-you-created-it');
  });
});

describe('the committed file', () => {
  const snippet = mcpJsonSnippet(SETUP);

  it('is valid json in the shape a client reads', () => {
    const parsed = JSON.parse(snippet);
    const server = parsed.mcpServers['ladigroup-rd-station-crm'];

    expect(server.type).toBe('http');
    expect(server.url).toBe('https://app.openipaas.com/api/mcp');
    expect(server.headers).toEqual({
      Authorization: 'Bearer ${OPENIPAAS_API_KEY}',
      'X-Account-Token': '${OPENIPAAS_ACCOUNT_TOKEN}',
    });
  });

  // A file for a repository holding a live token is a token to rotate.
  it('never carries the real token, even for an owner', () => {
    expect(snippet).not.toContain('tok-123');
    expect(snippet).not.toContain(TOKEN_PLACEHOLDER);
  });
});

describe('the check', () => {
  it('asks the server what tools this account has', () => {
    const check = curlCheck(SETUP);

    expect(check).toContain('https://app.openipaas.com/api/mcp');
    expect(JSON.parse(check.match(/-d '(.*)'/)![1])).toEqual({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  });
});

describe('a server for the whole client', () => {
  const command = claudeCodeCommand(CLIENT_SETUP);

  // Leaving the account token out is what widens the scope, so its absence is
  // the behaviour, not an omission.
  it('sends the key and no account token', () => {
    expect(command).toContain(`--header "Authorization: Bearer $${API_KEY_VARIABLE}"`);
    expect(command).not.toContain('X-Account-Token');
    expect(command).not.toContain(ACCOUNT_TOKEN_VARIABLE);
  });

  it('is named after the client alone', () => {
    expect(mcpServerName('LadiGroup')).toBe('ladigroup');
    expect(command).toContain('claude mcp add --transport http --scope user ladigroup ');
  });

  it('carries the same shape into the committed file and the check', () => {
    const parsed = JSON.parse(mcpJsonSnippet(CLIENT_SETUP));

    expect(parsed.mcpServers.ladigroup.headers).toEqual({ Authorization: 'Bearer ${OPENIPAAS_API_KEY}' });
    expect(curlCheck(CLIENT_SETUP)).not.toContain('X-Account-Token');
  });
});
