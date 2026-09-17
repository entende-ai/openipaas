/**
 * Plain SMTP, for the operator who already has a mail server.
 *
 * The HTTP providers cover the hosted services; this covers everyone else, and
 * everyone else is most of a self-hosted audience. nodemailer is imported
 * dynamically so it stays out of the bundle of a deployment that does not use
 * it, and so nothing drags a Node-only module into a client component.
 */

import { EmailDeliveryError, formatAddress, type EmailAddress, type EmailMessage, type EmailTransport } from '../types';
import type { SmtpConfig } from '../config';

const TIMEOUT_MS = 15_000;

/** A hung mail server should fail the form, not hold the request open. */
const TIMEOUTS = {
  connectionTimeout: TIMEOUT_MS,
  greetingTimeout: TIMEOUT_MS,
  socketTimeout: TIMEOUT_MS,
};

/**
 * `smtps://user:pass@host:465` into the fields.
 *
 * nodemailer reads a URL itself, but only as the whole configuration, and the
 * timeouts above have to go somewhere. Parsing it here also means the URL form
 * and the field form cannot drift apart, and that both are testable without a
 * mail server. Credentials are percent-decoded, because a password with an @ in
 * it has to be encoded to fit in a URL at all.
 */
export function parseSmtpUrl(url: string): SmtpConfig {
  const parsed = new URL(url);
  const secure = parsed.protocol === 'smtps:';
  const port = Number(parsed.port);

  return {
    host: parsed.hostname,
    port: Number.isFinite(port) && port > 0 ? port : secure ? 465 : 587,
    user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    secure: secure || undefined,
  };
}

/** The fields nodemailer wants, whichever way they were configured. */
export function smtpOptions(config: SmtpConfig) {
  const fields = config.url ? { ...parseSmtpUrl(config.url), ...stated(config) } : config;
  const port = fields.port ?? 587;

  return {
    host: fields.host,
    port,
    // 465 is TLS from the first byte; 587 opens plain and upgrades with STARTTLS.
    secure: fields.secure ?? port === 465,
    auth: fields.user ? { user: fields.user, pass: fields.password } : undefined,
    ...TIMEOUTS,
  };
}

/** Only the fields the operator actually set, so they can override the URL. */
function stated(config: SmtpConfig): Partial<SmtpConfig> {
  return Object.fromEntries(
    Object.entries(config).filter(([key, value]) => key !== 'url' && value !== undefined)
  );
}

export function smtpTransport(config: SmtpConfig): EmailTransport {
  return {
    name: 'smtp',

    async send(message: EmailMessage, from: EmailAddress) {
      const { createTransport } = await import('nodemailer');
      const mailer = createTransport(smtpOptions(config));

      try {
        const sent = await mailer.sendMail({
          from: formatAddress(from),
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          replyTo: message.replyTo,
        });

        return { id: typeof sent.messageId === 'string' ? sent.messageId : undefined };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new EmailDeliveryError(`SMTP refused the message: ${reason}`, 'smtp');
      } finally {
        mailer.close();
      }
    },
  };
}
