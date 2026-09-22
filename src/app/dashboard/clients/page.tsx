import Link from 'next/link'
import prisma from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CreateClientDialog } from './components/CreateClientDialog'
import { GenerateKeyButton } from './components/GenerateKeyButton'
import { AdminKeys } from './components/AdminKeys'
import { RevokeKeyButton } from './components/RevokeKeyButton'
import { ClientName } from './components/ClientName'
import { currentUser } from '@/lib/auth-session'
import { canDestroy } from '@/lib/dashboard/roles'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { McpSetupDialog } from '@/components/dashboard/McpSetupDialog'
import { clientScopePrefixes, connectionLabel } from '@/lib/mcp/connections'
import { isKnownProvider } from '@/lib/providers/core/registry'
import { findManifest } from '@/lib/providers/core/manifests'
import { pickActiveCredential } from '@/lib/credentials'
import { describeScopes } from '@/lib/scopes'

// Reads live data behind an authenticated session, so it must never be
// prerendered at build time.
export const dynamic = 'force-dynamic'

/**
 * What an agent on this client will see, computed the way the server computes
 * it, so the table in the dialog and the tool list cannot disagree.
 */
function agentAccounts(
  linkedAccounts: { id: string; provider: string; label: string | null; credentials: { createdAt: Date }[] }[]
) {
  const prefixes = clientScopePrefixes(
    linkedAccounts.map((account) => ({
      id: account.id,
      providerSlug: account.provider,
      usable: isKnownProvider(account.provider) && Boolean(pickActiveCredential(account.credentials)),
    }))
  )

  return linkedAccounts.map((account) => ({
    label: connectionLabel(findManifest(account.provider)?.name ?? account.provider, account.label),
    service: account.provider,
    prefix: prefixes.get(account.id) ?? null,
  }))
}

export default async function ClientsPage() {
  const me = await currentUser()
  // Revoking is one-way for whoever is calling with the key, so it is an owner's
  // decision. Members can still issue keys and see which ones exist.
  const mayRevoke = canDestroy(me?.role)
  // An agent connects to this deployment, so the snippets have to name it.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim()

  const adminKeys = await prisma.adminKey.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  const clients = await prisma.client.findMany({
    include: {
      apiKeys: { orderBy: { createdAt: 'desc' } },
      _count: { select: { linkedAccounts: true } },
      linkedAccounts: {
        select: { id: true, provider: true, label: true, credentials: { select: { createdAt: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients & keys"
        description="A client is whoever calls your unified API. Its key is the Authorization header they send."
      >
        <CreateClientDialog />
      </PageHeader>

      <AdminKeys
        mayManage={mayRevoke}
        keys={adminKeys.map((key) => ({
          id: key.id,
          prefix: key.keyPrefix,
          name: key.name,
          createdAt: key.createdAt.toISOString(),
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        }))}
      />

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
                  <ClientName clientId={client.id} name={client.name} />
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
                  {client._count.linkedAccounts > 0 && (
                    <McpSetupDialog
                      scope="client"
                      clientName={client.name}
                      appUrl={appUrl}
                      accounts={agentAccounts(client.linkedAccounts)}
                    />
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
                          {/* What a key may do cannot be changed after it is issued, so it is
                              stated next to the key rather than hidden behind an edit screen. */}
                          <p className="text-xs text-muted-foreground">
                            Can {describeScopes(key.scopes).toLowerCase()}
                            {key.rateLimit ? ` · ${key.rateLimit} requests per minute` : ''}
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
