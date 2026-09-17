/**
 * The provider for a deployment with no provider.
 *
 * A fresh clone has no mail account, and the flows that send mail still have to
 * work there: the message goes to the server log, where the operator running
 * `docker compose logs` can read the link out of it. It is also what makes a
 * sign-in link testable without the network.
 *
 * It never pretends to have delivered anything. sendEmail reports the transport
 * it used, and every caller is expected to tell the person on screen when that
 * transport was this one.
 */

import { formatAddress, type EmailAddress, type EmailMessage, type EmailTransport } from '../types';

export function logTransport(write: (line: string) => void = console.info): EmailTransport {
  return {
    name: 'log',

    async send(message: EmailMessage, from: EmailAddress) {
      write(
        [
          '',
          '  ─────────── email, not sent ───────────',
          `  from:    ${formatAddress(from) || '(EMAIL_FROM is not set)'}`,
          `  to:      ${message.to}`,
          `  subject: ${message.subject}`,
          '',
          message.text.replace(/^/gm, '  '),
          '  ───────────────────────────────────────',
          '',
        ].join('\n')
      );

      return {};
    },
  };
}
