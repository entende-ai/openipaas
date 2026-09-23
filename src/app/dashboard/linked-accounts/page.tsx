import Image from 'next/image'
import prisma from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConnectErpDialog } from './components/ConnectErpDialog'
import { InviteConnectDialog } from './components/InviteConnectDialog'
import { CopyTokenButton } from './components/CopyTokenButton'
import { PlaygroundDialog } from './components/PlaygroundDialog'
import { McpSetupDialog } from '@/components/dashboard/McpSetupDialog'
import { DisconnectButton } from './components/DisconnectButton'
import { connectionAbilities, connectionHealth, maskToken } from '@/lib/dashboard/connections'
import { connectionOffer, findManifest, listManifests } from '@/lib/providers/core/manifests'
import { pickActiveCredential } from '@/lib/credentials'
import { playgroundOperations } from '@/lib/dashboard/playground'
import { currentUser } from '@/lib/auth-session'
import { canDestroy, canRevealAccountToken } from '@/lib/dashboard/roles'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { clientScopePrefixes } from '@/lib/mcp/connections'
import { isKnownProvider } from '@/lib/providers/core/registry'
import { currentWorkspace, scopeTo } from '@/lib/dashboard/workspace'

// Reads live data behind an authenticated session, so it must never be
// prerendered at build time.
export const dynamic = 'force-dynamic'

const STATE_VARIANT = {
  active: 'default',
  expiring: 'secondary',
  stale: 'secondary',
  expired: 'destructive',
  missing: 'destructive',
} as const

export default async function LinkedAccountsPage() {
  const me = await currentUser()
  // Disconnecting means the end customer has to authorize the app again, and the
  // connection token is a live credential. Both are an owner's call.
  const mayDisconnect = canDestroy(me?.role)
  const mayCopyToken = canRevealAccountToken(me?.role)
  // The agent connects to this deployment, so the snippets have to name it.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim()

  const workspace = await currentWorkspace()
  const clients = workspace.clients

  const accounts = await prisma.linkedAccount.findMany({
    where: scopeTo(workspace.clientId),
    include: { client: true, credentials: { select: { createdAt: true, expiresAt: true, refreshToken: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // The prefix an agent sees depends on the other connections of the same
  // client, so it is computed per client, over the same set the server accepts.
  const agentPrefix = new Map<string, string>()
  // A plain loop rather than Map.groupBy: the image runs Node 20, which does not have it.
  const byClient = new Map<string, typeof accounts>()
  for (const account of accounts) {
    byClient.set(account.clientId, [...(byClient.get(account.clientId) ?? []), account])
  }
  for (const group of byClient.values()) {
    const prefixes = clientScopePrefixes(
      group.map((account) => ({
        id: account.id,
        providerSlug: account.provider,
        usable: isKnownProvider(account.provider) && Boolean(pickActiveCredential(account.credentials)),
      }))
    )
    for (const [id, prefix] of prefixes) agentPrefix.set(id, prefix)
  }

  // The connect dialog renders itself from the manifests, so a new provider
  // shows up here with no UI change.
  const providers = listManifests().map((m) => ({
    slug: m.slug,
    name: m.name,
    authType: m.auth.type,
    ...connectionOffer(m),
    fields: m.auth.type === 'OAUTH2' ? [] : m.auth.fields.map((f) => ({ ...f })),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connections"
        description={
          workspace.name
            ? `What ${workspace.name} has connected. The API key says which client; the service name, or the connection token when a client has two accounts on one service, says which system.`
            : 'A client plus a provider account. The API key says which client; the service name, or the connection token when a client has two accounts on one service, says which system.'
        }
      >
        <InviteConnectDialog clients={clients} providers={providers} defaultClientId={workspace.clientId} />
        <ConnectErpDialog clients={clients} providers={providers} defaultClientId={workspace.clientId} />
      </PageHeader>

      {clients.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Create a client first</CardTitle>
            <CardDescription>
              A connection belongs to a client, so there is nothing to attach a provider account to yet.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {accounts.length === 0 && clients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{workspace.name ? `${workspace.name} has no connections yet` : 'No connections yet'}</CardTitle>
            <CardDescription>
              Connecting an account is what gives a client access to a provider. OAuth providers open their own consent
              screen; key-based providers ask for the fields their manifest declares.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-4">
        {accounts.map((account) => {
          const manifest = findManifest(account.provider)
          const credential = pickActiveCredential(account.credentials)
          const health = connectionHealth({
            hasCredential: Boolean(credential),
            expiresAt: credential?.expiresAt ?? null,
            hasRefreshToken: Boolean(credential?.refreshToken),
          })
          const abilities = manifest ? connectionAbilities(manifest) : { unified: [], passthrough: false }
          const operations = manifest ? playgroundOperations(manifest) : []

          return (
            <Card key={account.id}>
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0">
                <div className="flex items-start gap-3">
                  {manifest?.logo ? (
                    <Image src={manifest.logo} alt="" width={36} height={36} className="rounded-lg" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xs">
                      {account.provider.slice(0, 2)}
                    </div>
                  )}

                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {manifest?.name ?? account.provider}
                      <span className="font-normal text-muted-foreground"> · {account.client.name}</span>
                    </CardTitle>
                    <CardDescription>
                      Connected {account.createdAt.toISOString().slice(0, 10)}
                      {abilities.unified.length > 0
                        ? ` · unified: ${abilities.unified.join(', ')}`
                        : abilities.passthrough
                          ? ' · passthrough only'
                          : ''}
                    </CardDescription>
                  </div>
                </div>

                <Badge variant={STATE_VARIANT[health.state]}>{health.label}</Badge>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">{health.detail}</p>

                <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted-foreground">Service</dt>
                  <dd>
                    <code className="rounded bg-muted/60 px-2 py-1 font-mono">{account.provider}</code>
                    <span className="ml-2 text-muted-foreground">sent as X-Provider</span>
                  </dd>

                  <dt className="text-muted-foreground">Agent tools</dt>
                  <dd>
                    {agentPrefix.get(account.id) ? (
                      <>
                        <code className="rounded bg-muted/60 px-2 py-1 font-mono">{agentPrefix.get(account.id)}…</code>
                        <span className="ml-2 text-muted-foreground">on the server for {account.client.name}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not offered to agents until this connection has a credential.</span>
                    )}
                  </dd>

                  <dt className="text-muted-foreground">Connection token</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted/60 px-2 py-1 font-mono">{maskToken(account.accountToken)}</code>
                    {mayCopyToken && <CopyTokenButton linkedAccountId={account.id} />}
                    <span className="text-muted-foreground">
                      sent as X-Account-Token, only needed when {account.client.name} has two accounts on this service
                    </span>
                  </dd>
                </dl>

                <div className="flex flex-wrap gap-2">
                  <PlaygroundDialog
                    linkedAccountId={account.id}
                    providerName={manifest?.name ?? account.provider}
                    operations={operations}
                    passthrough={abilities.passthrough}
                    baseUrl={manifest?.baseUrl ?? ''}
                    examples={manifest?.passthroughExamples ?? []}
                    docsUrl={manifest?.docsUrl}
                  />
                  <McpSetupDialog
                    scope="connection"
                    linkedAccountId={account.id}
                    clientName={account.client.name}
                    providerName={manifest?.name ?? account.provider}
                    appUrl={appUrl}
                    mayRevealToken={mayCopyToken}
                  />
                  {mayDisconnect && (
                    <DisconnectButton
                      linkedAccountId={account.id}
                      label={`${manifest?.name ?? account.provider} and ${account.client.name}`}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
