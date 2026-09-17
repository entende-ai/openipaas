/**
 * Password reset links: making one, reading one, and what the email says.
 *
 * The token in the URL is the whole credential, so it exists in two places
 * only: the link that was sent, and a sha256 of it in the database. Nothing
 * logs it, nothing renders it back, and a stolen database dump contains no
 * working link.
 *
 * Pure on purpose. The parts that touch Prisma live in the action; everything
 * here can be tested by passing it a clock.
 */

import { createHash, randomBytes } from 'crypto';

/**
 * Long enough to walk to another machine and read the mail, short enough that a
 * link left in an inbox is not a standing key to the console.
 */
export const RESET_TOKEN_TTL_MINUTES = 60;

/**
 * How long before another link can be asked for, per account. Somebody who
 * knows a colleague's address should not be able to fill their inbox with it.
 */
export const RESET_REQUEST_COOLDOWN_SECONDS = 60;

/** 32 bytes, so guessing one is not a strategy. */
export function createResetToken(random: (size: number) => Buffer = randomBytes): string {
  return random(32).toString('base64url');
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function resetTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000);
}

export interface StoredResetToken {
  expiresAt: Date;
  usedAt: Date | null;
}

export type ResetTokenProblem = 'unknown' | 'used' | 'expired';

/**
 * Why a link does not work, or null when it does.
 *
 * Used and expired are told apart here and deliberately not told apart on
 * screen: the person holding a link cannot learn from the page whether it was
 * ever real.
 */
export function resetTokenProblem(stored: StoredResetToken | null, now: Date = new Date()): ResetTokenProblem | null {
  if (!stored) return 'unknown';
  if (stored.usedAt) return 'used';
  if (stored.expiresAt.getTime() <= now.getTime()) return 'expired';
  return null;
}

export function canRequestAnother(lastRequestedAt: Date | null, now: Date = new Date()): boolean {
  if (!lastRequestedAt) return true;
  return now.getTime() - lastRequestedAt.getTime() >= RESET_REQUEST_COOLDOWN_SECONDS * 1000;
}

export function resetLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/reset/${token}`;
}

/** The message, in both parts. Plain text is the one that always arrives. */
export function resetEmail(link: string, recipientName?: string | null) {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';

  return {
    subject: 'Set a new password for Open IpaaS',
    text: [
      greeting,
      '',
      'Someone asked to reset the password for this Open IpaaS account.',
      'Open this link to choose a new one:',
      '',
      link,
      '',
      `The link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
      'If it was not you, nothing has changed and you can ignore this message.',
    ].join('\n'),
    html: [
      '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111">',
      `<p>${escapeHtml(greeting)}</p>`,
      '<p>Someone asked to reset the password for this Open IpaaS account.</p>',
      `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#111;color:#fff;text-decoration:none">Choose a new password</a></p>`,
      `<p style="color:#666;font-size:13px">The link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes. If it was not you, nothing has changed and you can ignore this message.</p>`,
      `<p style="color:#999;font-size:12px;word-break:break-all">${escapeHtml(link)}</p>`,
      '</div>',
    ].join(''),
  };
}

/** The link carries a token, and a name comes from a form. Neither is markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
