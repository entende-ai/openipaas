import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import prisma from '@/lib/prisma'
import { CreateClientDialog } from './components/CreateClientDialog'
import { GenerateKeyButton } from './components/GenerateKeyButton'

// Reads live data behind an authenticated session, so it must never be
// prerendered at build time.
export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    include: { apiKeys: true },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="space-y-4 max-w-6xl w-full mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Clients</h2>
          <p className="text-muted-foreground">Manage your B2B customers and their API Keys.</p>
        </div>
        <CreateClientDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registered Clients</CardTitle>
          <CardDescription>A list of all clients consuming the Unified API.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client Name</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    No clients found.
                  </TableCell>
                </TableRow>
              )}
              {clients.map((client) => {
                // Keys are stored hashed, so only the prefix can ever be displayed.
                const activeKey = client.apiKeys.filter((k) => !k.revokedAt).at(-1)
                
                return (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {activeKey ? (
                        `${activeKey.keyPrefix ?? 'oip_live'}${'…'}`
                      ) : (
                        <span className="text-muted-foreground italic">No key generated</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={activeKey ? 'default' : 'secondary'}>
                        {activeKey ? 'Active' : 'No Key'}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(client.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <GenerateKeyButton clientId={client.id} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
