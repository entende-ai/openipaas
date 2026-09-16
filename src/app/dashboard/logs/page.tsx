import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { listRecentRequests, requestStats } from '@/lib/request-log'

// Logs are written on every request, so this page must not be cached.
export const dynamic = 'force-dynamic'

function statusVariant(status: number): 'default' | 'secondary' | 'destructive' {
  if (status >= 500) return 'destructive'
  if (status >= 400) return 'secondary'
  return 'default'
}

export default async function LogsPage() {
  const [logs, stats] = await Promise.all([listRecentRequests({ limit: 100 }), requestStats()])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">API logs</h2>
        <p className="text-muted-foreground">Every unified API call, as it happened.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Requests (24h)</CardDescription>
            <CardTitle className="text-3xl">{stats.total.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Success rate (24h)</CardDescription>
            <CardTitle className="text-3xl">{(stats.successRate * 100).toFixed(1)}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg latency (24h)</CardDescription>
            <CardTitle className="text-3xl">{stats.avgLatencyMs}ms</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
          <CardDescription>Newest first. Share the request id when reporting an issue.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      No requests recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {log.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
                    </TableCell>
                    <TableCell>{log.client?.name ?? '-'}</TableCell>
                    <TableCell>{log.provider ?? '-'}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.method} {log.path}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(log.status)}>
                        {log.status}
                        {log.errorCode ? ` ${log.errorCode}` : ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{log.latencyMs}ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
