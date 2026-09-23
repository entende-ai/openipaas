import prisma from '@/lib/prisma'
import { outcomeUrl } from '@/lib/connect-session'
import { DoneMessage } from './DoneMessage'

export const dynamic = 'force-dynamic'

/**
 * Where the popup lands when the provider is finished with it.
 *
 * Its whole job is to tell the page that opened it and get out of the way. It
 * is also the page a customer sees when popups were blocked and the flow ran in
 * the same window, so it has to read as an answer on its own, not only as a
 * relay.
 */
export default async function ConnectDonePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; session?: string }>
}) {
  const params = await searchParams
  const status = ['connected', 'cancelled', 'failed', 'used'].includes(params.status ?? '')
    ? (params.status as 'connected' | 'cancelled' | 'failed' | 'used')
    : 'failed'

  // Read only to know where to send them back and which origins may be told.
  const session = params.session
    ? await prisma.connectSession.findUnique({ where: { id: params.session } })
    : null

  return (
    <DoneMessage
      status={status}
      origins={session?.origins ?? []}
      connectionId={session?.linkedAccountId ?? null}
      returnUrl={session ? outcomeUrl(session, status === 'used' ? 'connected' : status) : null}
    />
  )
}
