"use client"

import { useState } from 'react'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-rules'
import { generatePassword } from '@/lib/generate-password'
import { createTeamAccount } from '@/app/actions/team'

const ROLE_LABELS = { MEMBER: 'Member', OWNER: 'Owner' }

type Message =
  | { kind: 'error'; text: string }
  | { kind: 'success'; text: string; email: string; password: string }

/**
 * An owner creates the account and passes the password on.
 *
 * There is no mail server in a self-hosted install, so there is no invitation
 * email to send. Left to invent a first password, an owner reaches for one they
 * already use somewhere else, so there is a generator here; the password is
 * shown once, while it is being handed over, and the person changes it on their
 * first visit.
 */
export function AddAccountForm() {
  const [pending, setPending] = useState(false)
  const [password, setPassword] = useState('')
  const [generated, setGenerated] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  function onGenerate() {
    setPassword(generatePassword())
    setGenerated(true)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setMessage(null)

    const form = event.currentTarget
    const data = new FormData(form)
    const result = await createTeamAccount(data)
    setPending(false)

    if (result?.error) {
      setMessage({ kind: 'error', text: result.error })
      return
    }

    // The form is about to be cleared, so the password moves into the message
    // where it can still be copied. It is the only moment it exists in the open.
    setMessage({
      kind: 'success',
      text: result?.message ?? 'Account created.',
      email: String(data.get('email') ?? ''),
      password,
    })
    form.reset()
    setPassword('')
    setGenerated(false)
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
          <div className="flex gap-2">
            <Input
              id="password"
              name="password"
              type={generated ? 'text' : 'password'}
              required
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setGenerated(false)
              }}
              className={generated ? 'font-mono' : undefined}
            />
            <Button type="button" variant="outline" onClick={onGenerate} className="shrink-0">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Generate
            </Button>
          </div>
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

      {message?.kind === 'error' && <p className="text-sm text-destructive">{message.text}</p>}

      {message?.kind === 'success' && <Handover message={message} />}

      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create account'}
      </Button>
    </form>
  )
}

/** What the owner sends on, with the password still readable. */
function Handover({ message }: { message: Extract<Message, { kind: 'success' }> }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    await navigator.clipboard.writeText(`${message.email}\n${message.password}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="text-sm text-muted-foreground">{message.text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-background px-2 py-1 font-mono text-sm">{message.email}</code>
        <code className="rounded bg-background px-2 py-1 font-mono text-sm">{message.password}</code>
        <Button type="button" variant="ghost" size="sm" onClick={onCopy}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy both'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Copy it now. Once you leave this page the password is gone, and there is no reset yet: if it is lost, remove
        the account and create it again.
      </p>
    </div>
  )
}
