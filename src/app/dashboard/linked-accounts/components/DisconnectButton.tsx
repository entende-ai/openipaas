"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { deleteLinkedAccount } from '@/app/actions/linked-account'

/**
 * Disconnecting deletes the stored credential, and any key using this account
 * token stops working immediately. That is worth one confirmation.
 */
export function DisconnectButton({ linkedAccountId, label }: { linkedAccountId: string; label: string }) {
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await deleteLinkedAccount(linkedAccountId)
      setAsking(false)
    } catch (cause) {
      setError((cause as Error)?.message ?? 'The connection could not be removed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>
        Disconnect
      </Button>

      <Dialog open={asking} onOpenChange={(open) => !open && setAsking(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {label}?</DialogTitle>
            <DialogDescription>
              The stored credential is deleted and every request aimed at this connection starts failing. Connecting
              again means going through the provider&apos;s consent screen once more.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAsking(false)} disabled={pending}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
