import Link from 'next/link'
import prisma from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CreateClientDialog } from './components/CreateClientDialog'
import { GenerateKeyButton } from './components/GenerateKeyButton'
import { RevokeKeyButton } from './components/RevokeKeyButton'
import { currentUser } from '@/lib/auth-session'
import { canDestroy } from '@/lib/dashboard/roles'

// Reads live data behind an authenticated session, so it must never be
// prerendered at build time.
export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const me = await currentUser()
  // Revoking is one-way for whoever is calling with the key, so it is an owner's
  // decision. Members can still issue keys and see which ones exist.
  const mayRevoke = canDestroy(me?.role)

  const clients = await prisma.client.findMany({
    include: {
      apiKeys: { orderBy: { createdAt: 'desc' } },
      _count: { select: { linkedAccounts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Clients &amp; keys</h2>
          <p className="text-muted-foreground">
            A client is whoever calls your unified API. Its key is the Authorization header they send.
          </p>
        </div>
        <CreateClientDialog />
      </div>

      {clients.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No clients yet</CardTitle>
            <CardDescription>
              Create one for each customer, internal app or partner that will call the API. Everything else, keys and
              connections, hangs off a client.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-4">
        {clients.map((client) => {
          const active = client.apiKeys.filter((key) => !key.revokedAt)
          const revoked = client.apiKeys.length - active.length

          return (
            <Card key={client.id}>
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base">{client.name}</CardTitle>
                  <CardDescription>
                    Created {client.createdAt.toISOString().slice(0, 10)} · {client._count.linkedAccounts} connection
                    {client._count.linkedAccounts === 1 ? '' : 's'}
                    {revoked > 0 ? ` · ${revoked} revoked key${revoked === 1 ? '' : 's'}` : ''}
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  {client._count.linkedAccounts === 0 && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/dashboard/linked-accounts">Connect an account</Link>
                    </Button>
                  )}
                  <GenerateKeyButton clientId={client.id} />
                </div>
              </CardHeader>

              <CardContent>
                {active.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active key. Without one this client cannot call the API at all.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {active.map((key) => (
                      <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <p className="font-mono text-xs">
                            {/* Keys are stored hashed, so only the prefix can ever be shown. */}
                            {key.keyPrefix ?? 'oip_live'}
                            <span className="text-muted-foreground">••••••••</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {key.name ? `${key.name} · ` : ''}issued {key.createdAt.toISOString().slice(0, 10)}
                            {key.lastUsedAt ? ` · last used ${key.lastUsedAt.toISOString().slice(0, 10)}` : ' · never used'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant={key.lastUsedAt ? 'default' : 'secondary'}>
                            {key.lastUsedAt ? 'In use' : 'Unused'}
                          </Badge>
                          {mayRevoke && (
                            <RevokeKeyButton apiKeyId={key.id} keyLabel={`${key.keyPrefix ?? 'this key'}…`} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
