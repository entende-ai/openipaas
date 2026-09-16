"use server"

import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { requireDashboardSession, requireOwner } from '@/lib/auth-session'
import { asRole, wouldLeaveNoOwner, type Role } from '@/lib/dashboard/roles'
import { PASSWORD_MIN_LENGTH, hashPassword, looksLikeEmail, normalizeEmail, verifyPassword } from '@/lib/password'

/**
 * Console accounts, managed by whoever owns the deployment.
 *
 * Before this, the only way to create an account was to be the first person on
 * an empty install, so a second person meant sharing a password. An owner now
 * creates the account and hands over the credentials once; the person changes
 * the password themselves and the owner stops knowing it.
 *
 * No invitation tokens and no email yet, deliberately: a self-hosted install has
 * no mail server, and the owner is already talking to the person they are
 * adding. Tokens are issue #22.
 */

function validate(email: string, password: string): string | null {
  if (!looksLikeEmail(email)) return 'Enter a valid email address.'
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `The password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  return null
}

export async function createTeamAccount(formData: FormData) {
  await requireOwner()

  const email = normalizeEmail((formData.get('email') as string | null) ?? '')
  const password = (formData.get('password') as string | null) ?? ''
  const name = ((formData.get('name') as string | null) ?? '').trim()
  const role: Role = asRole((formData.get('role') as string | null) ?? 'MEMBER')

  const invalid = validate(email, password)
  if (invalid) return { error: invalid }

  const existing = await prisma.dashboardUser.findUnique({ where: { email }, select: { id: true } })
  if (existing) return { error: 'An account already uses that email address.' }

  await prisma.dashboardUser.create({
    data: { email, name: name || null, passwordHash: await hashPassword(password), role },
  })

  revalidatePath('/dashboard/team')
  return { success: true, message: `${email} can now sign in. Send them the password over something private.` }
}

export async function setTeamAccountRole(userId: string, role: string) {
  const actor = await requireOwner()
  const next = asRole(role)

  const users = await prisma.dashboardUser.findMany({ select: { id: true, role: true } })
  if (!users.some((user) => user.id === userId)) return { error: 'That account no longer exists.' }

  // Demoting the last owner would leave a console nobody can administer, and
  // DASHBOARD_PASSWORD does not fix that: it resets passwords, not roles.
  if (wouldLeaveNoOwner(users, { userId, to: next })) {
    return { error: 'This deployment needs at least one owner.' }
  }

  await prisma.dashboardUser.update({ where: { id: userId }, data: { role: next } })

  revalidatePath('/dashboard/team')
  return { success: true, message: userId === actor.id ? 'You changed your own role.' : 'Role updated.' }
}

export async function removeTeamAccount(userId: string) {
  const actor = await requireOwner()

  if (userId === actor.id) {
    return { error: 'You cannot remove your own account. Ask another owner to do it.' }
  }

  const users = await prisma.dashboardUser.findMany({ select: { id: true, role: true } })
  if (!users.some((user) => user.id === userId)) return { error: 'That account no longer exists.' }

  if (wouldLeaveNoOwner(users, { userId, to: 'REMOVED' })) {
    return { error: 'This deployment needs at least one owner.' }
  }

  // Sessions are stateless, so this account's cookie stays signed until it
  // expires. currentUser() reads the database on every dashboard request, so
  // the next one lands on the login page.
  await prisma.dashboardUser.delete({ where: { id: userId } })

  revalidatePath('/dashboard/team')
  return { success: true, message: 'Account removed.' }
}

/**
 * Changing your own password.
 *
 * The point of an owner handing over a first password is that it stops being
 * the owner's business afterwards.
 */
export async function changeOwnPassword(formData: FormData) {
  const actor = await requireDashboardSession()

  const current = (formData.get('currentPassword') as string | null) ?? ''
  const next = (formData.get('newPassword') as string | null) ?? ''

  if (next.length < PASSWORD_MIN_LENGTH) {
    return { error: `The new password must be at least ${PASSWORD_MIN_LENGTH} characters.` }
  }
  if (next === current) return { error: 'The new password is the same as the current one.' }

  const user = await prisma.dashboardUser.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true },
  })
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    return { error: 'That is not your current password.' }
  }

  await prisma.dashboardUser.update({
    where: { id: actor.id },
    data: { passwordHash: await hashPassword(next) },
  })

  revalidatePath('/dashboard/team')
  return { success: true, message: 'Password changed.' }
}
