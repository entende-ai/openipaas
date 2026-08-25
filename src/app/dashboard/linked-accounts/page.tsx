import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import prisma from '@/lib/prisma'
import { ConnectErpDialog } from './components/ConnectErpDialog'
import { CopyTokenButton } from './components/CopyTokenButton'
import { TestApiDialog } from './components/TestApiDialog'
import { listManifests } from '@/lib/providers/core/registry'

// Reads live data behind an authenticated session, so it must never be
// prerendered at build time.
export const dynamic = 'force-dynamic'

export default async function LinkedAccountsPage() {
  const accounts = await prisma.linkedAccount.findMany({
    include: { client: true },
    orderBy: { createdAt: 'desc' }
  })

  // We need to fetch clients to populate the Dropdown in the Dialog
  const clients = await prisma.client.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  // The connect dialog renders itself from the manifests, so a new provider
  // shows up here with no UI change.
  const providers = listManifests().map((m) => ({
    slug: m.slug,
    name: m.name,
    authType: m.auth.type,
    enabled: m.enabled,
    fields: m.auth.type === 'OAUTH2' ? [] : m.auth.fields.map((f) => ({ ...f })),
  }))

  return (
    <div className="space-y-4 max-w-6xl w-full mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Linked Accounts</h2>
          <p className="text-muted-foreground">End-user ERP integrations connected via OAuth.</p>
        </div>
        <ConnectErpDialog clients={clients} providers={providers} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Connections</CardTitle>
          <CardDescription>Use the X-Account-Token to route requests to the correct ERP.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>X-Account-Token</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    No linked accounts found.
                  </TableCell>
                </TableRow>
              )}
              {accounts.map((acc) => (
                <TableRow key={acc.id}>
                  <TableCell className="font-medium">{acc.client.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{acc.provider}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs bg-muted/50 px-2 py-1 rounded">{acc.accountToken}</code>
                      <CopyTokenButton token={acc.accountToken} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">Connected</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <TestApiDialog linkedAccountId={acc.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
