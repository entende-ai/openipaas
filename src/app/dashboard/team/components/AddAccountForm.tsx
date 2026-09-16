"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-rules'
import { createTeamAccount } from '@/app/actions/team'

const ROLE_LABELS = { MEMBER: 'Member', OWNER: 'Owner' }

/**
 * An owner creates the account and passes the password on.
 *
 * There is no mail server in a self-hosted install, so there is no invitation
 * email to send. The person changes the password on their first visit, which is
 * what the note under the field says.
 */
export function AddAccountForm() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setMessage(null)

    const form = event.currentTarget
    const result = await createTeamAccount(new FormData(form))
    setPending(false)

    if (result?.error) {
      setMessage({ kind: 'error', text: result.error })
      return
    }

    setMessage({ kind: 'success', text: result?.message ?? 'Account created.' })
    form.reset()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="off" placeholder="colleague@company.com" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="off" placeholder="Optional" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">First password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
          />
          <p className="text-xs text-muted-foreground">
            At least {PASSWORD_MIN_LENGTH} characters. Send it over something private; they change it under Your
            password.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select name="role" defaultValue="MEMBER" items={ROLE_LABELS}>
            <SelectTrigger id="role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MEMBER">Member</SelectItem>
              <SelectItem value="OWNER">Owner</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Owners manage the team, revoke keys, disconnect accounts and can copy account tokens.
          </p>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {message.text}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create account'}
      </Button>
    </form>
  )
}
