import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import prisma from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listRecentRequests, requestStats } from '@/lib/request-log'
import { connectionHealth } from '@/lib/dashboard/connections'
import { onboardingComplete, onboardingSteps } from '@/lib/dashboard/onboarding'
import { findManifest } from '@/lib/providers/core/manifests'
import { pickActiveCredential } from '@/lib/credentials'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { currentWorkspace, scopeTo } from '@/lib/dashboard/workspace'

/**
 * Where the console opens.
 *
 * It used to open on a table of clients, with nothing to say that a client
 * needs a key, that a key is useless without a connected account, and that the
 * point of all of it is the call at the end.
 */
export const dynamic = 'force-dynamic'

export default async function OverviewPage() {
  const workspace = await currentWorkspace()
  const scope = scopeTo(workspace.clientId)

  const [clients, activeKeys, accounts, stats, recent] = await Promise.all([
    // The onboarding steps ask whether a client exists at all, which is about
    // the deployment rather than about the selection.
    prisma.client.count(),
    prisma.apiKey.count({ where: { revokedAt: null, ...scope } }),
    prisma.linkedAccount.findMany({
      where: scope,
      include: { client: true, credentials: { select: { createdAt: true, expiresAt: true, refreshToken: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    requestStats(undefined, workspace.clientId),
    listRecentRequests({ limit: 5, clientId: workspace.clientId ?? undefined }),
  ])

  const steps = onboardingSteps({
    clients,
    activeKeys,
    connections: accounts.length,
    requests: stats.total,
  })

  const attention = accounts
    .map((account) => {
      const credential = pickActiveCredential(account.credentials)
      return {
        account,
        health: connectionHealth({
          hasCredential: Boolean(credential),
          expiresAt: credential?.expiresAt ?? null,
          hasRefreshToken: Boolean(credential?.refreshToken),
        }),
      }
    })
    .filter((row) => row.health.needsAttention)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          workspace.name
            ? `One API over many business systems. Here is the state of ${workspace.name}.`
            : 'One API over many business systems. Here is the state of yours.'
        }
      />

      {!onboardingComplete(steps) && (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>Four steps, in this order. You can come back to this list any time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-start gap-3 rounded-lg border p-3 ${
                  step.current ? 'border-foreground/20 bg-muted/40' : 'border-transparent'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    step.done ? 'bg-[#FDDE3F] text-black' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>

                <div className="flex-1 space-y-0.5">
                  <p className={`text-sm ${step.done ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>

                {step.current && (
                  <Button size="sm" asChild>
                    <Link href={step.href}>
                      {step.action}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clients" value={clients.toLocaleString()} hint={`${activeKeys} active key${activeKeys === 1 ? '' : 's'}`} />
        <Stat
          label="Connections"
          value={accounts.length.toLocaleString()}
          hint={attention.length > 0 ? `${attention.length} need attention` : 'All healthy'}
        />
        <Stat label="Requests (24h)" value={stats.total.toLocaleString()} hint={`${stats.avgLatencyMs}ms average`} />
        <Stat label="Success rate (24h)" value={`${(stats.successRate * 100).toFixed(1)}%`} hint="Across every client" />
      </div>

      {attention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Connections that need you</CardTitle>
            <CardDescription>These cannot serve requests until they are reconnected.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.map(({ account, health }) => (
              <div key={account.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {findManifest(account.provider)?.name ?? account.provider}
                    <span className="text-muted-foreground"> · {account.client.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{health.detail}</p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/dashboard/linked-accounts">Fix</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Recent requests</CardTitle>
            <CardDescription>The last calls your clients made.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/logs">All logs</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No requests yet. The playground on a connection is the quickest way to make the first one.
            </p>
          ) : (
            <div className="space-y-2">
              {recent.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-mono text-xs">
                    {log.method} {log.path}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    {log.client?.name ?? 'unknown client'}
                    <Badge variant={log.status >= 500 ? 'destructive' : log.status >= 400 ? 'secondary' : 'default'}>
                      {log.status}
                    </Badge>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}
