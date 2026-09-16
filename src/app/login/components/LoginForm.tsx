"use client"

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { login, resetPassword } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Sign in, plus recovery for a forgotten password.
 *
 * Recovery asks for the server password from the deployment's environment
 * instead of emailing a link, because a self-hosted install has no mail server.
 */
export function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard/clients'

  const [recovering, setRecovering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    const result = recovering ? await resetPassword(formData) : await login(formData)
    // Success redirects, so reaching here means it failed.
    if (result?.error) setError(result.error)
    setPending(false)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{recovering ? 'Set a new password' : 'Sign in'}</CardTitle>
        <CardDescription>
          {recovering
            ? 'Confirm with the server password from this deployment, then choose a new password.'
            : 'Use the email and password for your account.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{recovering ? 'New password' : 'Password'}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={recovering ? 'new-password' : 'current-password'}
              required
            />
          </div>

          {recovering && (
            <div className="space-y-2">
              <Label htmlFor="operatorPassword">Server password</Label>
              <Input id="operatorPassword" name="operatorPassword" type="password" autoComplete="off" required />
              <p className="text-xs text-muted-foreground">
                The DASHBOARD_PASSWORD value set on the server.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Working…' : recovering ? 'Set password and sign in' : 'Sign in'}
          </Button>

          <button
            type="button"
            className="w-full text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={() => {
              setRecovering(!recovering)
              setError(null)
            }}
          >
            {recovering ? 'Back to sign in' : 'Forgot your password?'}
          </button>
        </form>
      </CardContent>
    </Card>
  )
}
