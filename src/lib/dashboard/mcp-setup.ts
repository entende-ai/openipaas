/**
 * The exact commands that point an AI agent at one connection.
 *
 * Connecting an agent was a thing you had to be told how to do, by someone who
 * knew the two header names. It is configuration, so the platform that holds
 * the connection should hand it over, filled in.
 *
 * Pure string building, kept out of the component so the shapes can be tested
 * without a browser: a wrong quote here is a command somebody pastes into a
 * terminal and cannot debug.
 */

export const API_KEY_VARIABLE = 'OPENIPAAS_API_KEY';
export const ACCOUNT_TOKEN_VARIABLE = 'OPENIPAAS_ACCOUNT_TOKEN';

/** Shown in place of the token for anyone not allowed to see the real one. */
export const TOKEN_PLACEHOLDER = 'paste-the-account-token';

export interface McpSetup {
  appUrl: string;
  clientName: string;
  /**
   * 'client' covers every connection this client has, with tool names carrying
   * the account. 'connection' is one account, with plain tool names.
   */
  scope: 'client' | 'connection';
  /** Only meaningful for a connection scope. */
  providerName?: string;
  /** The real token for an owner, or null: the snippets stay correct either way. */
  accountToken?: string | null;
}

/**
 * A name for the server entry, from the client and the provider.
 *
 * An agent shows this to the person and the person has to recognize it, so it
 * carries both: one client can have two providers, and one provider can be
 * connected for two clients.
 */
export function mcpServerName(clientName: string, providerName?: string): string {
  const slug = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  return [slug(clientName), providerName ? slug(providerName) : ''].filter(Boolean).join('-') || 'openipaas';
}

export function mcpEndpoint(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/api/mcp`;
}

/**
 * Two exports and one add, because the key is not ours to fill in: it is shown
 * once when it is created and never again, which is the point of storing a hash.
 */
export function claudeCodeCommand(setup: McpSetup): string {
  const name = mcpServerName(setup.clientName, setup.providerName);
  const endpoint = mcpEndpoint(setup.appUrl);

  // Leaving the account token out is what widens the server to the whole
  // client. That is the only difference between the two commands.
  if (setup.scope === 'client') {
    return [
      `export ${API_KEY_VARIABLE}="the-key-you-copied-when-you-created-it"`,
      '',
      `claude mcp add --transport http --scope user ${name} ${endpoint} \\`,
      `  --header "Authorization: Bearer $${API_KEY_VARIABLE}"`,
    ].join('\n');
  }

  return [
    `export ${API_KEY_VARIABLE}="the-key-you-copied-when-you-created-it"`,
    `export ${ACCOUNT_TOKEN_VARIABLE}="${setup.accountToken ?? TOKEN_PLACEHOLDER}"`,
    '',
    `claude mcp add --transport http --scope user ${name} ${endpoint} \\`,
    `  --header "Authorization: Bearer $${API_KEY_VARIABLE}" \\`,
    `  --header "X-Account-Token: $${ACCOUNT_TOKEN_VARIABLE}"`,
  ].join('\n');
}

/**
 * The file form, for a repository where a team shares the connection.
 *
 * The values stay as ${VAR} here on purpose: this file gets committed, and a
 * key in a commit is a key to rotate.
 */
export function mcpJsonSnippet(setup: McpSetup): string {
  return JSON.stringify(
    {
      mcpServers: {
        [mcpServerName(setup.clientName, setup.providerName)]: {
          type: 'http',
          url: mcpEndpoint(setup.appUrl),
          headers:
            setup.scope === 'client'
              ? { Authorization: `Bearer \${${API_KEY_VARIABLE}}` }
              : {
                  Authorization: `Bearer \${${API_KEY_VARIABLE}}`,
                  'X-Account-Token': `\${${ACCOUNT_TOKEN_VARIABLE}}`,
                },
        },
      },
    },
    null,
    2
  );
}

/** One line to prove the connection answers before involving an agent. */
export function curlCheck(setup: McpSetup): string {
  const token = setup.accountToken ?? TOKEN_PLACEHOLDER;

  return [
    `curl -s ${mcpEndpoint(setup.appUrl)} \\`,
    `  -H "Authorization: Bearer $${API_KEY_VARIABLE}" \\`,
    ...(setup.scope === 'client' ? [] : [`  -H "X-Account-Token: ${token}" \\`]),
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  ].join('\n');
}
