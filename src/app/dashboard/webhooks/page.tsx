import prisma from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { currentUser } from '@/lib/auth-session'
import { canDestroy } from '@/lib/dashboard/roles'
import { EVENT_DESCRIPTIONS, EVENT_TYPES } from '@/lib/webhooks'
import { currentWorkspace, scopeTo } from '@/lib/dashboard/workspace'
import { AddEndpointDialog } from './components/AddEndpointDialog'
import { EndpointActions } from './components/EndpointActions'

// Reads live data behind an authenticated session.
export const dynamic = 'force-dynamic'

/**
 * Where a client is told that something changed.
 *
 * The only events today are about connections, which is the thing a caller
 * cannot find out on its own until a request fails in front of a user.
 */
export default async function WebhooksPage() {
  const me = await currentUser()
  const mayDelete = canDestroy(me?.role)

  const workspace = await currentWorkspace()

  const [clients, endpoints] = await Promise.all([
    Promise.resolve(workspace.clients),
    prisma.webhookEndpoint.findMany({
      where: scopeTo(workspace.clientId),
      include: {
        client: { select: { name: true } },
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, eventType: true, status: true, attempts: true, lastError: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description={
          workspace.name
            ? `Where ${workspace.name} is told when one of its connections is made, breaks, or is removed. Every delivery is signed, and a failed one is retried for about half a day.`
            : 'A client is told when one of its connections is made, breaks, or is removed. Every delivery is signed, and a failed one is retried for about half a day.'
        }
      >
        <AddEndpointDialog clients={clients} defaultClientId={workspace.clientId} />
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">The events</CardTitle>
          <CardDescription>Nothing else is emitted yet, and an event that is not here is not coming.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[auto_1fr]">
            {EVENT_TYPES.map((event) => (
              <div key={event} className="contents">
                <dt>
                  <code className="rounded bg-muted/60 px-2 py-1 font-mono">{event}</code>
                </dt>
                <dd className="text-muted-foreground">{EVENT_DESCRIPTIONS[event]}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {clients.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Create a client first</CardTitle>
            <CardDescription>An endpoint belongs to a client, so there is nothing to attach one to yet.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {endpoints.length === 0 && clients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No endpoints yet</CardTitle>
            <CardDescription>
              Without one, a client finds out that a connection expired when its next call fails, which is usually in
              front of somebody.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-4">
        {endpoints.map((endpoint) => (
          <Card key={endpoint.id}>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base break-all">{endpoint.url}</CardTitle>
                <CardDescription>
                  {endpoint.client.name} · added {endpoint.createdAt.toISOString().slice(0, 10)} ·{' '}
                  {endpoint.events.join(', ')}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={endpoint.active ? 'default' : 'secondary'}>{endpoint.active ? 'Active' : 'Paused'}</Badge>
                <EndpointActions endpointId={endpoint.id} active={endpoint.active} mayDelete={mayDelete} />
              </div>
            </CardHeader>

            <CardContent>
              {endpoint.deliveries.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing sent yet.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {endpoint.deliveries.map((delivery) => (
                    <li key={delivery.id} className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono">{delivery.eventType}</code>
                      <span className="text-muted-foreground">
                        {delivery.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                      </span>
                      <Badge variant={delivery.status === 'DELIVERED' ? 'default' : delivery.status === 'FAILED' ? 'destructive' : 'secondary'}>
                        {delivery.status.toLowerCase()}
                      </Badge>
                      {delivery.attempts > 1 && (
                        <span className="text-muted-foreground">{delivery.attempts} attempts</span>
                      )}
                      {delivery.lastError && <span className="text-muted-foreground">{delivery.lastError}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
