"use client"

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { issueAdminKey, revokeAdminKey } from '@/app/actions/admin-key'

export interface AdminKeyRow {
  id: string
  prefix: string
  name: string | null
  createdAt: string
  lastUsedAt: string | null
}

/**
 * The credential that creates clients.
 *
 * Kept on this page, above the clients it creates, because it is the only key
 * here that is not one client's, and the difference matters: leaking it is not
 * one company's problem.
 */
export function AdminKeys({ keys, mayManage }: { keys: AdminKeyRow[]; mayManage: boolean }) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [issued, setIssued] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  async function onIssue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const result = await issueAdminKey(name)
    setNaming(false)
    setName('')
    if (result?.key) setIssued(result.key)
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Admin API</CardTitle>
          <CardDescription>
            Creates clients and issues their keys, from your own product instead of from this screen. It crosses every
            client, so treat it as the most dangerous credential here: one per system, revoked the moment it is not
            needed.
          </CardDescription>
        </div>
        {mayManage && (
          <Button variant="outline" size="sm" onClick={() => setNaming(true)}>
            Issue admin key
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None issued. The admin API is unreachable until there is one, which is the right state for a deployment
            that does not use it.
          </p>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <p className="font-mono text-xs">
                    {key.prefix}
                    <span className="text-muted-foreground">••••••••</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {key.name ? `${key.name} · ` : ''}issued {key.createdAt.slice(0, 10)}
                    {key.lastUsedAt ? ` · last used ${key.lastUsedAt.slice(0, 10)}` : ' · never used'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={key.lastUsedAt ? 'default' : 'secondary'}>{key.lastUsedAt ? 'In use' : 'Unused'}</Badge>
                  {mayManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => startTransition(() => void revokeAdminKey(key.id))}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={naming} onOpenChange={(open) => !open && setNaming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New admin key</DialogTitle>
            <DialogDescription>
              It can create clients, issue and revoke their keys, and register their webhook endpoints. It cannot read
              anyone business data: reaching a provider still needs that client own key.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onIssue} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-key-name">What will use it?</Label>
              <Input
                id="admin-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Our product backend"
                autoFocus
                autoComplete="off"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNaming(false)}>
                Cancel
              </Button>
              <Button type="submit">Issue</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={issued !== null} onOpenChange={(open) => !open && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your admin key</DialogTitle>
            <DialogDescription>
              Copy it now: it is stored hashed and cannot be shown again. Keep it in a secret manager, never in a
              repository.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">{issued}</div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!issued) return
                await navigator.clipboard.writeText(issued)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
