"use client"

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isOwner } from '@/lib/dashboard/roles'
import { removeTeamAccount, setTeamAccountRole } from '@/app/actions/team'
import { sendResetLinkTo } from '@/app/actions/password-reset'

/**
 * Send a reset link, promote, demote, remove.
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
  const [sent, setSent] = useState<{ message: string; link?: string } | null>(null)

  async function run(action: () => Promise<{ error?: string } | undefined>) {
    setPending(true)
    setError(null)
    const result = await action()
    setPending(false)
    if (result?.error) setError(result.error)
  }

  async function onSendLink() {
    setPending(true)
    setError(null)
    setSent(null)

    const result = await sendResetLinkTo(userId)
    setPending(false)

    if ('error' in result) {
      setError(result.error)
      return
    }
    setSent(result)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {error && <span className="text-xs text-destructive">{error}</span>}

        <Button variant="ghost" size="sm" disabled={pending} onClick={onSendLink}>
          {pending ? 'Working…' : 'Send reset link'}
        </Button>

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
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() => run(() => removeTeamAccount(userId))}
              >
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

      {sent && <SentLink message={sent.message} link={sent.link} />}
    </div>
  )
}

/** The link is only ever shown when the deployment could not send it itself. */
function SentLink({ message, link }: { message: string; link?: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex max-w-md flex-col items-end gap-1 text-right">
      <span className="text-xs text-muted-foreground">{message}</span>

      {link && (
        <div className="flex items-center gap-1">
          <code className="max-w-xs truncate rounded bg-muted px-2 py-1 font-mono text-xs">{link}</code>
          <Button type="button" variant="ghost" size="sm" onClick={onCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}
    </div>
  )
}
