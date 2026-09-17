"use client"

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { login, resetPassword } from '@/app/actions/auth'
import { requestPasswordReset } from '@/app/actions/password-reset'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Sign in, and the two ways back in.
 *
 * A deployment with a mail provider emails a link. One without has the operator
 * password from its own environment, which is the recovery a self-hosted install
 * has always had and still needs when mail is the thing that is broken.
 */
type Mode = 'signin' | 'link' | 'operator'

const COPY: Record<Mode, { title: string; description: string; submit: string }> = {
  signin: {
    title: 'Sign in',
    description: 'Use the email and password for your account.',
    submit: 'Sign in',
  },
  link: {
    title: 'Reset your password',
    description: 'We will email you a link to choose a new one.',
    submit: 'Email me a link',
  },
  operator: {
    title: 'Set a new password',
    description: 'Confirm with the server password from this deployment, then choose a new password.',
    submit: 'Set password and sign in',
  },
}

export function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard/clients'

  const [mode, setMode] = useState<Mode>('signin')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function switchTo(target: Mode) {
    setMode(target)
    setError(null)
    setSent(null)
  }

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    setSent(null)

    if (mode === 'link') {
      const result = await requestPasswordReset(formData)
      if ('error' in result) setError(result.error)
      else setSent(result.message)
      setPending(false)
      return
    }

    // Success redirects, so reaching here means it failed.
    const result = mode === 'operator' ? await resetPassword(formData) : await login(formData)
    if (result?.error) setError(result.error)
    setPending(false)
  }

  const copy = COPY[mode]

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
          </div>

          {mode !== 'link' && (
            <div className="space-y-2">
              <Label htmlFor="password">{mode === 'operator' ? 'New password' : 'Password'}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'operator' ? 'new-password' : 'current-password'}
                required
              />
            </div>
          )}

          {mode === 'operator' && (
            <div className="space-y-2">
              <Label htmlFor="operatorPassword">Server password</Label>
              <Input id="operatorPassword" name="operatorPassword" type="password" autoComplete="off" required />
              <p className="text-xs text-muted-foreground">The DASHBOARD_PASSWORD value set on the server.</p>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {sent && <p className="text-sm text-muted-foreground">{sent}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Working…' : copy.submit}
          </Button>

          <div className="space-y-1 text-center">
            {mode === 'signin' && (
              <Recovery onClick={() => switchTo('link')}>Forgot your password?</Recovery>
            )}

            {mode === 'link' && (
              <>
                <Recovery onClick={() => switchTo('operator')}>
                  No mail on this server? Use the server password
                </Recovery>
                <Recovery onClick={() => switchTo('signin')}>Back to sign in</Recovery>
              </>
            )}

            {mode === 'operator' && (
              <>
                <Recovery onClick={() => switchTo('link')}>Email me a link instead</Recovery>
                <Recovery onClick={() => switchTo('signin')}>Back to sign in</Recovery>
              </>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Recovery({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="block w-full text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
