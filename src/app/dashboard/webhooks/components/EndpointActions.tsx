"use client"

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { deleteWebhookEndpoint, setWebhookEndpointActive } from '@/app/actions/webhooks'

/**
 * Pausing is the reversible half and deleting is not.
 *
 * A receiver that is down does not need its endpoint deleted, it needs the
 * queue to stop growing, so pausing is the first thing on offer.
 */
export function EndpointActions({
  endpointId,
  active,
  mayDelete,
}: {
  endpointId: string
  active: boolean
  mayDelete: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => void setWebhookEndpointActive(endpointId, !active))}
      >
        {active ? 'Pause' : 'Resume'}
      </Button>

      {mayDelete &&
        (confirming ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => startTransition(() => void deleteWebhookEndpoint(endpointId))}
            >
              Delete for good
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ))}
    </div>
  )
}
