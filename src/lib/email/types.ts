/**
 * What every mail provider has to agree on.
 *
 * One message shape and one verb. A provider is a translation from this shape
 * into someone's HTTP API or into SMTP, and nothing else in the application
 * knows which one is in use.
 */

export interface EmailMessage {
  /** A single recipient. Nothing here sends to a list, on purpose. */
  to: string;
  subject: string;
  /** Required. Text is the message; html, when present, is the nicer copy. */
  text: string;
  html?: string;
  replyTo?: string;
}

/** A parsed From, because half the providers want the name split out. */
export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailTransport {
  readonly name: string;
  /** Resolves with the provider's id for the message when it gives one. */
  send(message: EmailMessage, from: EmailAddress): Promise<{ id?: string }>;
}

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    public readonly transport: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

/**
 * `Name <email@host>` or a bare address.
 *
 * Providers that take a single string get it back joined; the ones that want
 * fields get them separately. Anything unparseable is treated as the address,
 * because refusing to send over a malformed display name helps nobody.
 */
export function parseAddress(from: string): EmailAddress {
  const angled = from.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (!angled) return { email: from.trim() };

  const name = angled[1].replace(/^"(.*)"$/, '$1').trim();
  return name ? { email: angled[2].trim(), name } : { email: angled[2].trim() };
}

export function formatAddress(address: EmailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}
