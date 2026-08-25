"use server"

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, checkPassword, isDashboardAuthConfigured, issueSessionToken } from '@/lib/auth-session'

export async function login(formData: FormData) {
  if (!isDashboardAuthConfigured()) {
    return { error: 'Dashboard authentication is not configured on this server.' }
  }

  const password = (formData.get('password') as string | null) ?? ''
  const next = ((formData.get('next') as string | null) || '/dashboard/clients').toString()

  if (!checkPassword(password)) {
    // Deliberately vague: no hint about whether the password was close.
    return { error: 'Invalid credentials.' }
  }

  const store = await cookies()
  store.set(SESSION_COOKIE, await issueSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 60 * 60,
  })

  // Only same-origin paths, so the parameter cannot be used as an open redirect.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard/clients')
}

export async function logout() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect('/login')
}
