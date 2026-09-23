"use client"

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getProviderAuthUrl } from '@/app/actions/oauth'
import { connectErpAccount } from '@/app/actions/linked-account'

export interface ConnectableProvider {
  slug: string
  name: string
  authType: 'OAUTH2' | 'API_KEY' | 'CUSTOM'
  /** From connectionOffer(): whether it can be picked, and what to say beside it. */
  connectable: boolean
  note: string | null
  fields: { key: string; label: string; required: boolean; secret: boolean }[]
}

/**
 * Rendered entirely from the provider manifests: an OAuth provider gets a
 * redirect, a key-based provider gets its declared fields. Adding a provider
 * needs no change here.
 */
export function ConnectErpDialog({
  clients,
  providers,
  defaultClientId,
}: {
  clients: { id: string; name: string }[]
  providers: ConnectableProvider[]
  /** The client the console is looking at, preselected so it is not asked twice. */
  defaultClientId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string>('')

  const selected = useMemo(() => providers.find((p) => p.slug === selectedSlug), [providers, selectedSlug])

  // The form posts ids and slugs; a person reads names. Base UI renders the
  // value itself unless it is given the labels to go with it.
  const clientLabels = useMemo(
    () => Object.fromEntries(clients.map((client) => [client.id, client.name])),
    [clients]
  )
  const providerLabels = useMemo(
    () => Object.fromEntries(providers.map((provider) => [provider.slug, provider.name])),
    [providers]
  )

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    const clientId = formData.get('clientId') as string
    if (!clientId || !selected) {
      setError('Select a client and a provider.')
      return
    }

    setIsLoading(true)

    if (selected.authType === 'OAUTH2') {
      const result = await getProviderAuthUrl(selected.slug, clientId)
      setIsLoading(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      window.location.href = result.url
      return
    }

    const result = await connectErpAccount(formData)
    setIsLoading(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>Connect account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect an account</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clientId">Client</Label>
            {/* `items` is what makes the trigger read "Ladigroup" instead of the
                uuid it posts. Without it Base UI shows the raw value. */}
            <Select name="clientId" items={clientLabels} defaultValue={defaultClientId ?? undefined}>
              <SelectTrigger id="clientId">
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
            <Label htmlFor="provider">Provider</Label>
            <Select
              name="provider"
              items={providerLabels}
              onValueChange={(value) => setSelectedSlug(typeof value === 'string' ? value : '')}
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.slug} value={provider.slug} disabled={!provider.connectable}>
                    {provider.name}
                    {provider.note ? ` (${provider.note})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Manifest-declared credential inputs for non-OAuth providers. */}
          {selected?.authType !== 'OAUTH2' &&
            selected?.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  name={field.key}
                  type={field.secret ? 'password' : 'text'}
                  required={field.required}
                />
              </div>
            ))}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isLoading || !selected}>
              {isLoading ? 'Connecting…' : selected?.authType === 'OAUTH2' ? 'Continue to provider' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
