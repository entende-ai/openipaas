"use client"

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { submitConnectCredentials } from '@/app/actions/connect'
import { CONNECT_MESSAGE_TYPE, type ConnectOutcome } from '@/lib/connect-message'

export interface OfferedProvider {
  slug: string
  name: string
  description: string
  logo: string | null
  authType: 'OAUTH2' | 'API_KEY' | 'CUSTOM'
  connectable: boolean
  note: string | null
  fields: { key: string; label: string; required: boolean; secret: boolean; help?: string }[]
}

type Outcome = ConnectOutcome

/**
 * The customer's side of connecting.
 *
 * OAuth opens in a popup rather than in place. The provider consent screens
 * refuse to be framed, so a page embedded in somebody's product cannot navigate
 * to them and come back: the frame would go blank and the customer would be
 * stuck with no way to explain what happened. The popup navigates, we hear from
 * it when it lands, and the embedded page never moves.
 */
export function ConnectFlow({
  token,
  label,
  logoUrl,
  accentColor,
  origins,
  providers,
}: {
  token: string
  label: string | null
  logoUrl: string | null
  accentColor: string | null
  origins: string[]
  providers: OfferedProvider[]
}) {
  const [selected, setSelected] = useState<OfferedProvider | null>(providers.length === 1 ? providers[0] : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  /**
   * Tells whoever is watching, once.
   *
   * Every message names its target origin explicitly, from the list the session
   * was created with. A `*` here would broadcast the outcome, and with it the
   * fact that this customer connected, to whatever page happens to be framing.
   */
  function announce(next: Outcome, connectionId?: string) {
    setOutcome(next)

    const message = { type: CONNECT_MESSAGE_TYPE, status: next, ...(connectionId ? { connection: connectionId } : {}) }
    for (const origin of origins) {
      try {
        window.parent?.postMessage(message, origin)
        window.opener?.postMessage(message, origin)
      } catch {
        // A closed opener or a cross-origin parent that went away is not this
        // page's problem: the product also hears about it by webhook.
      }
    }
  }

  // The popup ends on our own /connect/done, which posts back here.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== CONNECT_MESSAGE_TYPE) return

      setBusy(false)
      if (event.data.status === 'connected') announce('connected', event.data.connection)
      else if (event.data.status === 'cancelled') setError('The connection was cancelled.')
      else if (event.data.status === 'used') setError('This link was already used.')
      else setError('The provider could not complete the connection. Please try again.')
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origins])

  function startOAuth(provider: OfferedProvider) {
    setError(null)
    setBusy(true)

    const popup = window.open(
      `/connect/${encodeURIComponent(token)}/start/${encodeURIComponent(provider.slug)}`,
      'openipaas-connect',
      'width=560,height=760,noopener=no'
    )

    // Blocked popups are common enough that pretending otherwise is a support
    // ticket. Same window is a worse experience and always works.
    if (!popup) {
      window.location.href = `/connect/${encodeURIComponent(token)}/start/${encodeURIComponent(provider.slug)}`
      return
    }

    const timer = window.setInterval(() => {
      if (!popup.closed) return
      window.clearInterval(timer)
      // Closed without a message means they walked away from the consent screen.
      setBusy((current) => {
        if (current) setError('The window was closed before the connection finished.')
        return false
      })
    }, 700)
  }

  async function onSubmitFields(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return

    setBusy(true)
    setError(null)

    const result = await submitConnectCredentials(token, selected.slug, new FormData(event.currentTarget))
    setBusy(false)

    if (result.error) {
      setError(result.error)
      return
    }
    announce('connected', result.connectionId)
  }

  const accent = accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : undefined

  if (outcome === 'connected') {
    return (
      <Card>
        <CardHeader>
          <Brand label={label} logoUrl={logoUrl} />
          <CardTitle>Connected</CardTitle>
          <CardDescription>
            You can close this window. Nothing else is needed from you, and the account can be disconnected at any
            time from the product that sent you here.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <Brand label={label} logoUrl={logoUrl} />
        <CardTitle>{selected ? `Connect ${selected.name}` : 'Connect an account'}</CardTitle>
        <CardDescription>
          {label
            ? `${label} will be able to read and write the data you authorize here, and nothing else.`
            : 'The product that sent you here will be able to read and write the data you authorize, and nothing else.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {providers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            There is nothing to connect here yet. Ask whoever sent you this link.
          </p>
        )}

        {!selected &&
          providers.map((provider) => (
            <button
              key={provider.slug}
              type="button"
              onClick={() => setSelected(provider)}
              disabled={!provider.connectable}
              className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {provider.logo ? (
                <Image src={provider.logo} alt="" width={32} height={32} className="rounded-md" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs">
                  {provider.name.slice(0, 2)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium">{provider.name}</span>
                <span className="block text-xs text-muted-foreground">{provider.note ?? provider.description}</span>
              </span>
            </button>
          ))}

        {selected && selected.authType === 'OAUTH2' && (
          <>
            <p className="text-sm text-muted-foreground">
              A {selected.name} window will open for you to sign in and approve. We never see your password.
            </p>
            <Button
              type="button"
              className="w-full"
              style={accent ? { backgroundColor: accent } : undefined}
              disabled={busy}
              onClick={() => startOAuth(selected)}
            >
              {busy ? 'Waiting for the window…' : `Continue to ${selected.name}`}
            </Button>
          </>
        )}

        {selected && selected.authType !== 'OAUTH2' && (
          <form onSubmit={onSubmitFields} className="space-y-3">
            {selected.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  name={field.key}
                  type={field.secret ? 'password' : 'text'}
                  required={field.required}
                  autoComplete="off"
                />
                {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
              </div>
            ))}

            <Button type="submit" className="w-full" style={accent ? { backgroundColor: accent } : undefined} disabled={busy}>
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </form>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {selected && providers.length > 1 && !busy && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-4"
            onClick={() => {
              setSelected(null)
              setError(null)
            }}
          >
            Choose a different service
          </button>
        )}
      </CardContent>
    </Card>
  )
}

/** The product's name, if it gave one. Never the client's, which is ours. */
function Brand({ label, logoUrl }: { label: string | null; logoUrl: string | null }) {
  if (!label && !logoUrl) return null

  return (
    <div className="mb-2 flex items-center gap-2">
      {logoUrl && (
        // Not next/image: the URL belongs to whoever created the session, and
        // remote patterns cannot be known ahead of time.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-6 w-6 rounded" />
      )}
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  )
}
