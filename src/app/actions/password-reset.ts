"use server"

import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { requireOwner } from '@/lib/auth-session'
import { startSessionCookie } from '@/lib/dashboard/session-cookie'
import { PASSWORD_MIN_LENGTH, hashPassword, normalizeEmail } from '@/lib/password'
import { sendEmail, emailStatus } from '@/lib/email'
import {
  canRequestAnother,
  createResetToken,
  hashResetToken,
  resetEmail,
  resetLink,
  resetTokenExpiry,
  resetTokenProblem,
  RESET_TOKEN_TTL_MINUTES,
} from '@/lib/password-reset'

/**
 * Resetting a password with a link.
 *
 * The token in the link is the credential, so it exists in exactly two places:
 * the message that was sent, and a sha256 of it in the database. It is never
 * returned to the browser that asked for it, never logged by these actions, and
 * a used or expired one is refused with the same sentence as one that was never
 * real.
 *
 * Asking for a link says the same thing whether or not the address has an
 * account. A reset form that answers differently is a way to find out who has an
 * account on a deployment, which is the first half of attacking it.
 */

const SAME_ANSWER = 'If that address has an account, a link is on its way. It expires in an hour.'

/** Appended when the deployment cannot send, so nobody waits for nothing. */
function mailNote(): string {
  const status = emailStatus()
  if (status.canSend) return ''

  return status.problems.length > 0
    ? ` This server cannot send mail yet (${status.problems.join(' ')}), so the link was written to the server log.`
    : ' This server has no mail provider configured, so the link was written to the server log.'
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000').trim()
}

/**
 * Issues a link for a user that is known to exist.
 *
 * Any link already in flight is marked used first: asking for a new one should
 * retire the old, or a forwarded message stays a way in.
 */
async function issueLink(user: { id: string; email: string; name: string | null }) {
  const token = createResetToken()

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  })

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt: resetTokenExpiry() },
  })

  const link = resetLink(appUrl(), token)
  const message = resetEmail(link, user.name)
  const outcome = await sendEmail({ to: user.email, ...message })

  return { link, outcome }
}

export async function requestPasswordReset(formData: FormData) {
  const email = normalizeEmail((formData.get('email') as string | null) ?? '')
  const answer = { message: SAME_ANSWER + mailNote() }

  if (!email) return { error: 'Enter the email address for your account.' }

  const user = await prisma.dashboardUser.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  })

  if (!user) return answer

  // One link a minute per account, so knowing an address is not a way to fill
  // somebody's inbox with reset mail.
  const latest = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  if (!canRequestAnother(latest?.createdAt ?? null)) return answer

  await issueLink(user)
  return answer
}

/**
 * What the reset page shows before asking for a password: whether this link is
 * worth filling in a form for.
 */
export async function checkResetToken(token: string) {
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { expiresAt: true, usedAt: true },
  })

  // Used and expired are told apart in the database and not on screen.
  return { valid: resetTokenProblem(stored) === null }
}

export async function completePasswordReset(formData: FormData) {
  const token = ((formData.get('token') as string | null) ?? '').trim()
  const password = (formData.get('password') as string | null) ?? ''

  if (password.length < PASSWORD_MIN_LENGTH) {
    return { error: `The password must be at least ${PASSWORD_MIN_LENGTH} characters.` }
  }

  const stored = token
    ? await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(token) },
        select: { id: true, userId: true, expiresAt: true, usedAt: true },
      })
    : null

  if (resetTokenProblem(stored) !== null) {
    return { error: 'This link does not work any more. Ask for a new one.' }
  }

  const now = new Date()

  // The update is conditional on the row still being unused, so two submissions
  // of the same link cannot both set a password.
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: stored!.id, usedAt: null },
    data: { usedAt: now },
  })

  if (claimed.count === 0) {
    return { error: 'This link does not work any more. Ask for a new one.' }
  }

  await prisma.dashboardUser.update({
    where: { id: stored!.userId },
    data: { passwordHash: await hashPassword(password), lastLoginAt: now },
  })

  await startSessionCookie(stored!.userId)
  redirect('/dashboard/clients')
}

/**
 * An owner sends a link to somebody else's account.
 *
 * An owner can already remove that account and create it again, so this grants
 * nothing new; it replaces doing it the destructive way. When the deployment
 * cannot send mail, the link comes back to be passed on by hand, which is the
 * one place a token is ever shown.
 */
export async function sendResetLinkTo(userId: string): Promise<{ error: string } | { message: string; link?: string }> {
  await requireOwner()

  const user = await prisma.dashboardUser.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  })

  if (!user) return { error: 'That account no longer exists.' }

  const { link, outcome } = await issueLink(user)

  if (outcome.delivered) {
    return { message: `Sent to ${user.email}. The link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.` }
  }

  return {
    message: outcome.error
      ? `Could not send the mail: ${outcome.error} Pass this link on yourself, it expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`
      : `This server sends no mail, so here is the link. It expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
    link,
  }
}
