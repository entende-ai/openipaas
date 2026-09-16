"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { isOwner } from '@/lib/dashboard/roles'
import { removeTeamAccount, setTeamAccountRole } from '@/app/actions/team'

/**
 * Promote, demote, remove.
 *
 * The last owner cannot be demoted or removed, and the server refuses it too:
 * this only keeps the screen from offering something that would fail.
 */
export function AccountActions({
  userId,
  role,
  label,
  isSelf,
}: {
  userId: string
  role: string
  label: string
  isSelf: boolean
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function run(action: () => Promise<{ error?: string } | undefined>) {
    setPending(true)
    setError(null)
    const result = await action()
    setPending(false)
    if (result?.error) setError(result.error)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}

      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setTeamAccountRole(userId, isOwner(role) ? 'MEMBER' : 'OWNER'))}
      >
        {isOwner(role) ? 'Make member' : 'Make owner'}
      </Button>

      {!isSelf &&
        (confirming ? (
          <>
            <span className="text-xs text-muted-foreground">Remove {label}?</span>
            <Button variant="destructive" size="sm" disabled={pending} onClick={() => run(() => removeTeamAccount(userId))}>
              {pending ? 'Removing…' : 'Yes, remove'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Remove
          </Button>
        ))}
    </div>
  )
}
