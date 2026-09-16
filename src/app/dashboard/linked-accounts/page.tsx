import Image from 'next/image'
import prisma from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConnectErpDialog } from './components/ConnectErpDialog'
import { CopyTokenButton } from './components/CopyTokenButton'
import { PlaygroundDialog } from './components/PlaygroundDialog'
import { DisconnectButton } from './components/DisconnectButton'
import { connectionAbilities, connectionHealth, maskToken } from '@/lib/dashboard/connections'
import { connectionOffer, findManifest, listManifests } from '@/lib/providers/core/manifests'
import { pickActiveCredential } from '@/lib/credentials'
import { playgroundOperations } from '@/lib/dashboard/playground'

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
  const [accounts, clients] = await Promise.all([
    prisma.linkedAccount.findMany({
      include: { client: true, credentials: { select: { createdAt: true, expiresAt: true, refreshToken: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

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
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Connections</h2>
          <p className="text-muted-foreground">
            A client plus a provider account. The account token routes each request to the right one.
          </p>
        </div>
        <ConnectErpDialog clients={clients} providers={providers} />
      </div>

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
            <CardTitle>No connections yet</CardTitle>
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

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">X-Account-Token</span>
                  <code className="rounded bg-muted/60 px-2 py-1 font-mono text-xs">
                    {maskToken(account.accountToken)}
                  </code>
                  <CopyTokenButton token={account.accountToken} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <PlaygroundDialog
                    linkedAccountId={account.id}
                    providerName={manifest?.name ?? account.provider}
                    operations={operations}
                    passthrough={abilities.passthrough}
                    baseUrl={manifest?.baseUrl ?? ''}
                  />
                  <DisconnectButton
                    linkedAccountId={account.id}
                    label={`${manifest?.name ?? account.provider} and ${account.client.name}`}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
