"use server"

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import {
  SESSION_COOKIE,
  checkOperatorPassword,
  isDashboardAuthConfigured,
  issueSessionToken,
} from '@/lib/auth-session'
import { PASSWORD_MIN_LENGTH, hashPassword, looksLikeEmail, normalizeEmail, verifyPassword } from '@/lib/password'

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

/**
 * Sign-in for the admin console.
 *
 * Accounts live in the database; DASHBOARD_PASSWORD is the operator secret that
 * authorizes creating the first account and resetting a forgotten password,
 * because a self-hosted deployment has no mail server to send links from.
 */

async function startSession(userId: string, next: string): Promise<never> {
  const store = await cookies()
  store.set(SESSION_COOKIE, await issueSessionToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })

  // Only same-origin paths, so the parameter cannot be used as an open redirect.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard/clients')
}

function readNext(formData: FormData): string {
  return ((formData.get('next') as string | null) || '/dashboard/clients').toString()
}

/** Shared by setup and reset: the same rules, reported the same way. */
function validateNewCredentials(email: string, password: string): string | null {
  if (!looksLikeEmail(email)) return 'Enter a valid email address.'
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `The password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  return null
}

export async function login(formData: FormData) {
  if (!isDashboardAuthConfigured()) {
    return { error: 'Dashboard authentication is not configured on this server.' }
  }

  const email = normalizeEmail((formData.get('email') as string | null) ?? '')
  const password = (formData.get('password') as string | null) ?? ''

  const user = email ? await prisma.dashboardUser.findUnique({ where: { email } }) : null

  // Deliberately vague, and the hash still runs when the account is unknown, so
  // neither the message nor the timing says whether the email exists.
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA')

  if (!user || !ok) return { error: 'Invalid email or password.' }

  await prisma.dashboardUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

  await startSession(user.id, readNext(formData))
}

/**
 * Creates the first account, and only the first: once one exists this refuses,
 * so a public deployment cannot be claimed by whoever finds it first. The
 * operator password is what proves the person owns the deployment.
 */
export async function createFirstAccount(formData: FormData) {
  if (!isDashboardAuthConfigured()) {
    return { error: 'Dashboard authentication is not configured on this server.' }
  }

  if ((await prisma.dashboardUser.count()) > 0) {
    return { error: 'An account already exists on this server. Sign in instead.' }
  }

  const email = normalizeEmail((formData.get('email') as string | null) ?? '')
  const password = (formData.get('password') as string | null) ?? ''
  const operatorPassword = (formData.get('operatorPassword') as string | null) ?? ''
  const name = ((formData.get('name') as string | null) ?? '').trim()

  const invalid = validateNewCredentials(email, password)
  if (invalid) return { error: invalid }

  if (!checkOperatorPassword(operatorPassword)) {
    return { error: 'That server password is not correct.' }
  }

  // The first account owns the deployment, and is the only one that can invite
  // anybody else into it.
  const user = await prisma.dashboardUser.create({
    data: {
      email,
      name: name || null,
      passwordHash: await hashPassword(password),
      role: 'OWNER',
      lastLoginAt: new Date(),
    },
  })

  await startSession(user.id, readNext(formData))
}

/**
 * Password recovery without email: whoever can read the deployment's
 * environment can set a new password for an existing account.
 */
export async function resetPassword(formData: FormData) {
  if (!isDashboardAuthConfigured()) {
    return { error: 'Dashboard authentication is not configured on this server.' }
  }

  const email = normalizeEmail((formData.get('email') as string | null) ?? '')
  const password = (formData.get('password') as string | null) ?? ''
  const operatorPassword = (formData.get('operatorPassword') as string | null) ?? ''

  const invalid = validateNewCredentials(email, password)
  if (invalid) return { error: invalid }

  if (!checkOperatorPassword(operatorPassword)) {
    return { error: 'That server password is not correct.' }
  }

  const user = await prisma.dashboardUser.findUnique({ where: { email }, select: { id: true } })
  if (!user) return { error: 'No account uses that email address.' }

  await prisma.dashboardUser.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), lastLoginAt: new Date() },
  })

  await startSession(user.id, readNext(formData))
}

export async function logout() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect('/login')
}
