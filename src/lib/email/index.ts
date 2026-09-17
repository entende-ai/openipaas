/**
 * Sending mail, without the caller knowing who sends it.
 *
 * One function, one outcome type, no throwing. Mail is best effort in this
 * application: a password reset that could not be emailed is still a password
 * reset, and the screen that asked for it has to be able to say what happened
 * instead of showing a stack trace.
 */

import { EmailDeliveryError, parseAddress, type EmailMessage, type EmailTransport } from './types';
import { readEmailConfig, type EmailConfig } from './config';
import { HTTP_PROVIDERS, httpTransport, type Fetcher } from './transports/http';
import { smtpTransport } from './transports/smtp';
import { logTransport } from './transports/log';

export type { EmailMessage } from './types';
export { emailStatus, readEmailConfig, EMAIL_PROVIDERS, PROVIDER_KEY_VARIABLES } from './config';
export type { EmailStatus, EmailProviderName } from './config';

export interface DeliveryOutcome {
  /** The provider accepted it. False means nobody has the message. */
  delivered: boolean;
  /** Which transport answered. 'log' means it was printed, not sent. */
  transport: string;
  id?: string;
  /** Present when delivered is false. Safe to show an operator. */
  error?: string;
}

export interface SendOptions {
  config?: EmailConfig;
  fetchImpl?: Fetcher;
  /** Where the log transport writes, so a test can read it. */
  write?: (line: string) => void;
}

export function transportFor(config: EmailConfig, options: SendOptions = {}): EmailTransport {
  if (config.provider === 'log' || config.problems.length > 0) return logTransport(options.write);
  if (config.provider === 'smtp') return smtpTransport(config.smtp ?? {});

  const spec = HTTP_PROVIDERS[config.provider];
  // Unreachable through readEmailConfig: every non-smtp provider has a spec.
  if (!spec) return logTransport(options.write);

  return httpTransport(spec, config.apiKey ?? '', options.fetchImpl);
}

export async function sendEmail(message: EmailMessage, options: SendOptions = {}): Promise<DeliveryOutcome> {
  const config = options.config ?? readEmailConfig();
  const transport = transportFor(config, options);

  // A misconfigured provider falls back to the log rather than failing silently,
  // so the operator can still read what should have gone out.
  if (config.provider !== 'log' && config.problems.length > 0) {
    await transport.send(message, parseAddress(config.from));
    return {
      delivered: false,
      transport: 'log',
      error: `Mail is not configured: ${config.problems.join(' ')}`,
    };
  }

  try {
    const { id } = await transport.send(message, parseAddress(config.from));
    // The log transport is honest about having delivered nothing.
    return { delivered: transport.name !== 'log', transport: transport.name, id };
  } catch (error) {
    const reason = error instanceof EmailDeliveryError ? error.message : String(error);
    console.error(`[email] ${reason}`);
    return { delivered: false, transport: transport.name, error: reason };
  }
}
