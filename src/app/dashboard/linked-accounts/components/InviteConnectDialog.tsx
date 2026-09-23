"use client"

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createConnectLink } from '@/app/actions/connect'
import type { ConnectableProvider } from './ConnectErpDialog'

/**
 * A link to send somebody who has the account but not this console.
 *
 * The same session the admin API hands out, made from here so that trying the
 * flow once does not require issuing an admin key first. What comes back is a
 * live credential for thirty minutes, so it is shown for copying and never
 * stored anywhere this page can read again.
 */
export function InviteConnectDialog({
  clients,
  providers,
  defaultClientId,
}: {
  clients: { id: string; name: string }[]
  providers: ConnectableProvider[]
  defaultClientId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const clientLabels = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients])
  const providerLabels = useMemo(
    () => Object.fromEntries([['', 'Let them choose'], ...providers.map((p) => [p.slug, p.name])]),
    [providers]
  )

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsLoading(true)

    const result = await createConnectLink(new FormData(event.currentTarget))
    setIsLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }
    setLink(result.url ?? null)
  }

  function reset(next: boolean) {
    setOpen(next)
    if (!next) {
      setLink(null)
      setError(null)
      setCopied(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger>
        <Button variant="outline">Invite to connect</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{link ? 'Send them this link' : 'Invite someone to connect an account'}</DialogTitle>
        </DialogHeader>

        {link ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              It works once and expires in 30 minutes. Whoever opens it connects their own account to this client,
              and sees nothing else of this console.
            </p>
            <Input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
            <DialogFooter>
              <Button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(link)
                  setCopied(true)
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              For an account that belongs to someone else: the customer whose ERP it is, or the person at that
              company who can approve it.
            </p>

            <div className="space-y-2">
              <Label htmlFor="invite-client">Client</Label>
              <Select name="clientId" items={clientLabels} defaultValue={defaultClientId ?? undefined}>
                <SelectTrigger id="invite-client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-provider">Service</Label>
              <Select name="provider" items={providerLabels} defaultValue="">
                <SelectTrigger id="invite-provider">
                  <SelectValue placeholder="Let them choose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Let them choose</SelectItem>
                  {providers.map((provider) => (
                    <SelectItem key={provider.slug} value={provider.slug} disabled={!provider.connectable}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-label">Shown to them as (optional)</Label>
              <Input id="invite-label" name="label" placeholder="Your product's name" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-origin">Embedded in (optional)</Label>
              <Input id="invite-origin" name="origin" placeholder="https://your-app.com" />
              <p className="text-xs text-muted-foreground">
                Only needed to put the page in an iframe. Leave it empty and the link still works in a tab, a popup
                or an email.
              </p>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <DialogFooter>
              <Button type="submit" disabled={isLoading || clients.length === 0}>
                {isLoading ? 'Creating…' : 'Create link'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
