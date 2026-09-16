"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { revokeApiKey } from '@/app/actions/client'

/** Revoking takes effect on the next request, so the confirmation says so. */
export function RevokeKeyButton({ apiKeyId, keyLabel }: { apiKeyId: string; keyLabel: string }) {
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    await revokeApiKey(apiKeyId)
    setPending(false)
    setAsking(false)
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>
        Revoke
      </Button>

      <Dialog open={asking} onOpenChange={(open) => !open && setAsking(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {keyLabel}?</DialogTitle>
            <DialogDescription>
              Any request using this key is rejected from the next call onwards. Issue a new key first if something in
              production depends on it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAsking(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? 'Revoking…' : 'Revoke key'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
