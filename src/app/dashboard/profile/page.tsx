import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { currentUser } from '@/lib/auth-session'
import { canDestroy, isOwner, lastSeen, roleLabel } from '@/lib/dashboard/roles'
import { ChangePasswordForm } from '../team/components/ChangePasswordForm'
import { AdminKeys } from './components/AdminKeys'

export const dynamic = 'force-dynamic'

/**
 * Your account, and the credentials that are not any client's.
 *
 * The admin key used to sit on Clients and keys, one card above the keys it can
 * create. Two credentials on one screen, one of which crosses every client, is
 * how the dangerous one gets treated like the ordinary one. It lives here
 * instead, behind the account, with the room to say what it does.
 */
export default async function ProfilePage() {
  const me = await currentUser()
  if (!me) redirect('/login')

  // Issuing something that reaches every client is an owner's call, and so is
  // revoking one somebody else's integration may be holding.
  const mayManageAdminKeys = canDestroy(me.role)

  const [account, adminKeys] = await Promise.all([
    prisma.dashboardUser.findUnique({ where: { id: me.id }, select: { lastLoginAt: true, createdAt: true } }),
    mayManageAdminKeys
      ? prisma.adminKey.findMany({ where: { revokedAt: null }, orderBy: { createdAt: 'desc' } })
      : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Your profile" description="The account you signed in with, and what it is allowed to do." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[120px_1fr]">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{me.name || <span className="text-muted-foreground">Not set</span>}</dd>

            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">{me.email}</dd>

            <dt className="text-muted-foreground">Role</dt>
            <dd className="flex items-center gap-2">
              <Badge variant={isOwner(me.role) ? 'default' : 'secondary'}>{roleLabel(me.role)}</Badge>
              <span className="text-xs text-muted-foreground">
                {isOwner(me.role)
                  ? 'Manages the team, revokes keys, disconnects accounts.'
                  : 'Day to day work. Cannot revoke keys or disconnect accounts.'}
              </span>
            </dd>

            <dt className="text-muted-foreground">Last sign in</dt>
            <dd className="text-muted-foreground">{lastSeen(account?.lastLoginAt ?? null)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your password</CardTitle>
          <CardDescription>
            Changing it here does not sign out anything else you are signed in on. If you think someone else has it,
            change it and tell an owner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      {mayManageAdminKeys && (
        <AdminKeys
          keys={adminKeys.map((key) => ({
            id: key.id,
            prefix: key.keyPrefix,
            name: key.name,
            createdAt: key.createdAt.toISOString(),
            lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
          }))}
        />
      )}
    </div>
  )
}
