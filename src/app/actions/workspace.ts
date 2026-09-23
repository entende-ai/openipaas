"use server"

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireDashboardSession } from '@/lib/auth-session'
import { WORKSPACE_COOKIE } from '@/lib/dashboard/workspace'

/**
 * Picking the client the console is looking at.
 *
 * A cookie rather than a path segment: the selection follows the person across
 * pages and sessions, and no link anyone has saved stops working. It is a view
 * preference, not permission: everyone signed in can already see every client,
 * so nothing here is a boundary.
 */
export async function selectWorkspace(clientId: string | null) {
  await requireDashboardSession()

  const store = await cookies()

  if (clientId) {
    store.set(WORKSPACE_COOKIE, clientId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  } else {
    store.delete(WORKSPACE_COOKIE)
  }

  // Every page reads it, so none of them may keep a cached answer.
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}
