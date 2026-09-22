"use client"

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EVENT_DESCRIPTIONS, EVENT_TYPES } from '@/lib/webhooks'
import { addWebhookEndpoint } from '@/app/actions/webhooks'

/**
 * Registers a URL, and hands over the signing secret once.
 *
 * The secret is the whole point of the endpoint: without checking the signature
 * a receiver is trusting whoever found the URL, and this is the only moment the
 * secret exists in the clear.
 */
export function AddEndpointDialog({ clients }: { clients: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const clientLabels = useMemo(
    () => Object.fromEntries(clients.map((client) => [client.id, client.name])),
    [clients]
  )

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const result: { error?: string; secret?: string } = await addWebhookEndpoint(new FormData(event.currentTarget))
    setPending(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setOpen(false)
    setSecret(result.secret ?? null)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button disabled={clients.length === 0}>Add endpoint</Button>} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New webhook endpoint</DialogTitle>
            <DialogDescription>
              We post a signed JSON body to this URL. Anything other than a 2xx is retried with backoff for about
              half a day.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-client">Client</Label>
              <Select name="clientId" items={clientLabels} defaultValue={clients[0]?.id}>
                <SelectTrigger id="webhook-client" className="w-full">
                  <SelectValue />
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
              <Label htmlFor="webhook-url">URL</Label>
              <Input id="webhook-url" name="url" placeholder="https://your-app.com/hooks/openipaas" autoComplete="off" />
              <p className="text-xs text-muted-foreground">https, except on localhost.</p>
            </div>

            <div className="space-y-2">
              <Label>Events</Label>
              {EVENT_TYPES.map((event) => (
                <label key={event} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" name="events" value={event} defaultChecked className="mt-1" />
                  <span>
                    <code className="font-mono text-xs">{event}</code>
                    <span className="block text-xs text-muted-foreground">{EVENT_DESCRIPTIONS[event]}</span>
                  </span>
                </label>
              ))}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Adding…' : 'Add endpoint'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={secret !== null} onOpenChange={(next) => !next && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>The signing secret</DialogTitle>
            <DialogDescription>
              Copy it now: it is stored encrypted and cannot be shown again. Your receiver uses it to verify the
              X-OpenIpaas-Signature header, which is an HMAC over the timestamp and the body.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">{secret}</div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!secret) return
                await navigator.clipboard.writeText(secret)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button onClick={() => setSecret(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
