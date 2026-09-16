"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-rules'
import { changeOwnPassword } from '@/app/actions/team'

/** So a password an owner handed over stops being the owner's business. */
export function ChangePasswordForm() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setMessage(null)

    const form = event.currentTarget
    const result = await changeOwnPassword(new FormData(form))
    setPending(false)

    if (result?.error) {
      setMessage({ kind: 'error', text: result.error })
      return
    }

    setMessage({ kind: 'success', text: result?.message ?? 'Password changed.' })
    form.reset()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
          />
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {message.text}
        </p>
      )}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Change password'}
      </Button>
    </form>
  )
}
