import prisma from '@/lib/prisma'
import { currentUser } from '@/lib/auth-session'
import { canManageTeam, isOwner, lastSeen, roleLabel } from '@/lib/dashboard/roles'
import { emailStatus } from '@/lib/email'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { AddAccountForm } from './components/AddAccountForm'
import { AccountActions } from './components/AccountActions'
import { ChangePasswordForm } from './components/ChangePasswordForm'
import { PageHeader } from '@/components/dashboard/PageHeader'

export const dynamic = 'force-dynamic'

/**
 * Whether a reset link will actually be sent, said before anyone presses the
 * button. It names the provider and never the key: emailStatus carries no
 * secret, and this is a screen a whole team can open.
 */
function mailNote(status: ReturnType<typeof emailStatus>): string {
  if (status.canSend) return `Reset links are emailed through ${status.provider}, from ${status.from}.`

  return status.problems.length > 0
    ? `Mail is half configured (${status.problems.join(' ')}), so a reset link is shown here to pass on by hand. See docs/EMAIL.md.`
    : 'No mail provider is configured, so a reset link is shown here to pass on by hand. See docs/EMAIL.md to have it emailed.'
}

/**
 * Who can sign in to this console.
 *
 * Before this page the only account was the one created on an empty install, so
 * adding a colleague meant sharing a password. An owner creates the account
 * here and hands the password over once; the person changes it below.
 */
export default async function TeamPage() {
  const me = await currentUser()
  const canManage = canManageTeam(me?.role)

  const users = await prisma.dashboardUser.findMany({
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Everyone here signs in with their own email and password. Owners manage the team, revoke keys and disconnect accounts; members do the day to day work."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
          {canManage && <CardDescription>{mailNote(emailStatus())}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-1">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 hover:bg-muted/30"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{user.name || user.email}</span>
                  <Badge variant={isOwner(user.role) ? 'default' : 'secondary'}>{roleLabel(user.role)}</Badge>
                  {user.id === me?.id && <span className="text-xs text-muted-foreground">you</span>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {user.name ? `${user.email} · ` : ''}
                  {lastSeen(user.lastLoginAt)}
                </p>
              </div>

              {canManage && (
                <AccountActions
                  userId={user.id}
                  role={user.role}
                  label={user.name || user.email}
                  isSelf={user.id === me?.id}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add someone</CardTitle>
          </CardHeader>
          <CardContent>
            <AddAccountForm />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
