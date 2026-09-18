/**
 * Naming the connections behind one MCP server.
 *
 * A server opened on one connection (by connection token or X-Provider) has its
 * tools under their plain names. A server opened with only an API key is the client, which
 * may have several connections, and every tool then carries the connection it
 * belongs to: `rd_station_crm__list_contacts`.
 *
 * The prefix is part of the name rather than an argument because the tools of
 * two providers are not interchangeable. A single `connection` parameter would
 * offer a model `list_deals` on an accounting system, and it would find out by
 * failing.
 */

export const PREFIX_SEPARATOR = '__';

export interface NamedConnection {
  /** LinkedAccount id, used to keep two connections to one provider apart. */
  id: string;
  providerSlug: string;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * A prefix per connection, in the order given.
 *
 * Two connections to the same provider are told apart by the start of the
 * linked account id, not by their position, so a prefix does not change when an
 * unrelated connection is removed. An agent that learned a tool name keeps it.
 */
export function prefixesFor(connections: NamedConnection[]): string[] {
  const counts = new Map<string, number>();
  for (const connection of connections) {
    const base = slug(connection.providerSlug);
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }

  return connections.map((connection) => {
    const base = slug(connection.providerSlug);
    const unique = (counts.get(base) ?? 0) > 1 ? `${base}_${connection.id.replace(/-/g, '').slice(0, 6)}` : base;
    return `${unique}${PREFIX_SEPARATOR}`;
  });
}

/**
 * What a person calls this connection when a screen or a guide names it.
 *
 * A connection is labelled with its provider's name by default, so a label that
 * only repeats it adds nothing and reads as a mistake: "RD Station CRM (RD
 * Station CRM)".
 */
export function connectionLabel(providerName: string, label: string | null): string {
  const extra = (label ?? '').trim();
  if (!extra || extra.toLowerCase() === providerName.trim().toLowerCase()) return providerName;
  return `${providerName} (${extra})`;
}

export interface AgentEligibility {
  id: string;
  providerSlug: string;
  /** A known provider with a stored credential: what withClientAuth accepts. */
  usable: boolean;
}

/**
 * The prefix each of a client's connections gets on a client-scoped server.
 *
 * The dashboard shows these and the server uses them, so both have to be
 * computed over the same set. A connection the server leaves out, one with no
 * credential or an unknown provider, gets no entry here: counting it would make
 * a lone account look like one of two and give it a prefix nobody can call.
 */
export function clientScopePrefixes(accounts: AgentEligibility[]): Map<string, string> {
  const usable = accounts.filter((account) => account.usable);
  const prefixes = prefixesFor(usable);
  return new Map(usable.map((account, index) => [account.id, prefixes[index]]));
}
