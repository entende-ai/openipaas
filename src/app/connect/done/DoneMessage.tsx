"use client"

import { useEffect } from 'react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CONNECT_MESSAGE_TYPE, type ConnectOutcome } from '@/lib/connect-message'

type Outcome = ConnectOutcome

const COPY: Record<Outcome, { title: string; body: string }> = {
  connected: {
    title: 'Connected',
    body: 'You can close this window. The account is linked and nothing else is needed from you.',
  },
  cancelled: {
    title: 'Nothing was connected',
    body: 'You closed the sign-in before approving. You can close this window and try again when you are ready.',
  },
  failed: {
    title: 'That did not work',
    body: 'The service could not finish the connection. Close this window and try again, or ask for a new link.',
  },
  used: {
    title: 'This link was already used',
    body: 'The account it was for is connected. If something is wrong with it, ask for a new link.',
  },
}

/**
 * The last screen of the popup, and the one that reports back.
 *
 * Three audiences, in order of how well they can hear. The page that opened the
 * popup is ours and same origin, so it gets the message first and updates in
 * place. A product framing us directly gets the same message, addressed to each
 * origin the session was created with and never to `*`. A browser that allowed
 * neither still has the redirect, which carries the outcome in the query.
 */
export function DoneMessage({
  status,
  origins,
  connectionId,
  returnUrl,
}: {
  status: Outcome
  origins: string[]
  connectionId: string | null
  returnUrl: string | null
}) {
  useEffect(() => {
    const message = {
      type: CONNECT_MESSAGE_TYPE,
      status,
      ...(status === 'connected' && connectionId ? { connection: connectionId } : {}),
    }

    const opener = window.opener as Window | null
    let heard = false

    try {
      if (opener && !opener.closed) {
        opener.postMessage(message, window.location.origin)
        heard = true
      }
    } catch {
      // An opener that navigated away or was closed mid-flight.
    }

    // Framed directly, with no popup in between: the parent is the product.
    if (!heard && window.parent !== window) {
      for (const origin of origins) {
        try {
          window.parent.postMessage(message, origin)
          heard = true
        } catch {
          // Wrong origin for this frame; the next one may be right.
        }
      }
    }

    if (heard) {
      // The opener closes popups itself, but a popup that outlives its opener
      // should not sit here forever pretending to be a page.
      if (opener) window.setTimeout(() => window.close(), 400)
      return
    }

    // Nobody was listening. The redirect is the only way the product hears, and
    // when there is none this page is the whole answer, which is what it says.
    if (returnUrl) window.location.replace(returnUrl)
  }, [status, origins, connectionId, returnUrl])

  const copy = COPY[status]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.body}</CardDescription>
        {status === 'connected' && (
          <CardDescription className="pt-2">
            If this window stays open, go back to the page that sent you here; it will show the connection.
          </CardDescription>
        )}
      </CardHeader>
    </Card>
  )
}
