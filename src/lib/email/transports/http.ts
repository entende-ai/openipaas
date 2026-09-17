/**
 * The providers that are just an HTTP POST.
 *
 * Resend, Brevo, Postmark and SendGrid differ only in a URL, a header and the
 * spelling of the same five fields, so they are a table rather than four files.
 * Supporting another one means adding an entry here; that is the point.
 */

import { EmailDeliveryError, formatAddress, type EmailAddress, type EmailMessage, type EmailTransport } from '../types';

export type Fetcher = typeof fetch;

/** Long enough for a slow provider, short enough that a form does not hang. */
const TIMEOUT_MS = 10_000;

export interface HttpProviderSpec {
  name: string;
  endpoint: string;
  headers(apiKey: string): Record<string, string>;
  body(message: EmailMessage, from: EmailAddress): unknown;
  /** Where the provider puts the message id in a successful response. */
  idFrom(payload: Record<string, unknown>): string | undefined;
}

export const HTTP_PROVIDERS: Record<string, HttpProviderSpec> = {
  resend: {
    name: 'resend',
    endpoint: 'https://api.resend.com/emails',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    body: (message, from) => ({
      from: formatAddress(from),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      reply_to: message.replyTo,
    }),
    idFrom: (payload) => (typeof payload.id === 'string' ? payload.id : undefined),
  },

  brevo: {
    name: 'brevo',
    endpoint: 'https://api.brevo.com/v3/smtp/email',
    headers: (apiKey) => ({ 'api-key': apiKey }),
    body: (message, from) => ({
      sender: { email: from.email, name: from.name },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html,
      replyTo: message.replyTo ? { email: message.replyTo } : undefined,
    }),
    idFrom: (payload) => (typeof payload.messageId === 'string' ? payload.messageId : undefined),
  },

  postmark: {
    name: 'postmark',
    endpoint: 'https://api.postmarkapp.com/email',
    headers: (apiKey) => ({ 'X-Postmark-Server-Token': apiKey }),
    body: (message, from) => ({
      From: formatAddress(from),
      To: message.to,
      Subject: message.subject,
      TextBody: message.text,
      HtmlBody: message.html,
      ReplyTo: message.replyTo,
      MessageStream: 'outbound',
    }),
    idFrom: (payload) => (typeof payload.MessageID === 'string' ? payload.MessageID : undefined),
  },

  sendgrid: {
    name: 'sendgrid',
    endpoint: 'https://api.sendgrid.com/v3/mail/send',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    body: (message, from) => ({
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: from.email, name: from.name },
      subject: message.subject,
      content: [
        { type: 'text/plain', value: message.text },
        ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
      ],
      reply_to: message.replyTo ? { email: message.replyTo } : undefined,
    }),
    // 202 with an empty body. The id is in a header, which nobody needs.
    idFrom: () => undefined,
  },
};

/** Provider errors are quoted back to the operator, so keep them short. */
function summarize(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat;
}

export function httpTransport(spec: HttpProviderSpec, apiKey: string, fetchImpl: Fetcher = fetch): EmailTransport {
  return {
    name: spec.name,

    async send(message, from) {
      let response: Response;

      try {
        response = await fetchImpl(spec.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...spec.headers(apiKey) },
          // undefined fields drop out here, which is what every provider wants.
          body: JSON.stringify(spec.body(message, from)),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new EmailDeliveryError(`Could not reach ${spec.name}: ${reason}`, spec.name);
      }

      const raw = await response.text();

      if (!response.ok) {
        throw new EmailDeliveryError(
          `${spec.name} refused the message (${response.status}): ${summarize(raw) || 'no details'}`,
          spec.name,
          response.status
        );
      }

      try {
        const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        return { id: spec.idFrom(payload) };
      } catch {
        // Accepted, and the body was not JSON. The message is gone either way.
        return {};
      }
    },
  };
}
