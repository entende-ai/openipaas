"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-rules'
import { completePasswordReset } from '@/app/actions/password-reset'

/**
 * Choosing the new password.
 *
 * The token rides in a hidden field rather than being read from the URL here,
 * so the value the server checks is the one the page was built with.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)

    // Success signs in and redirects, so reaching here means it failed.
    const result = await completePasswordReset(formData)
    if (result?.error) setError(result.error)
    setPending(false)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>You will be signed in once it is set.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="token" value={token} />

          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters.</p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Working…' : 'Set password and sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
