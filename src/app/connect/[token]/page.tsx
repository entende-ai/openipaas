import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { offeredProviders, resolveConnectSession } from '@/lib/connect-session'
import { connectionOffer } from '@/lib/providers/core/manifests'
import { ConnectFlow } from './ConnectFlow'

// The session is read on every view and burned on use, so nothing here may be
// prerendered or cached.
export const dynamic = 'force-dynamic'

/**
 * Where an end customer connects their own account.
 *
 * Reached through a one-time link the product sent them. They never see this
 * console, never pick a client from a list, and are never told which other
 * companies exist here: the token decides the client, and the page says only
 * what the session asked it to say.
 */
export default async function ConnectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resolved = await resolveConnectSession(token)

  if (resolved.state !== 'ok') {
    return <Refusal state={resolved.state} />
  }

  const { session } = resolved
  const providers = offeredProviders(session).map((manifest) => ({
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    logo: manifest.logo ?? null,
    authType: manifest.auth.type,
    ...connectionOffer(manifest),
    fields: manifest.auth.type === 'OAUTH2' ? [] : manifest.auth.fields.map((field) => ({ ...field })),
  }))

  return (
    <ConnectFlow
      token={token}
      label={session.label}
      logoUrl={session.logoUrl}
      accentColor={session.accentColor}
      origins={session.origins}
      providers={providers}
    />
  )
}

/**
 * Three refusals, worded apart.
 *
 * A customer who already connected and clicked the old email again needs to
 * hear something different from one whose link sat for an hour, and both need
 * to hear something different from one who mistyped the URL. Same message for
 * all three is how support tickets are made.
 */
function Refusal({ state }: { state: 'invalid' | 'expired' | 'used' }) {
  const copy = {
    invalid: {
      title: 'This link is not valid',
      body: 'Check that you opened the whole link. If you copied it out of an email, part of it may have been left behind.',
    },
    expired: {
      title: 'This link has expired',
      body: 'Connection links are short lived on purpose. Ask for a new one and it will work the same way.',
    },
    used: {
      title: 'This link was already used',
      body: 'The account it was for is connected. If something is wrong with it, ask for a new link.',
    },
  }[state]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.body}</CardDescription>
      </CardHeader>
    </Card>
  )
}
