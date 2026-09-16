"use client"

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createFirstAccount } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-rules'

/**
 * Shown only while the deployment has no account.
 *
 * The server password proves the person setting this up owns the deployment,
 * which is what keeps a public URL from being claimed by a stranger.
 */
export function FirstAccountForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard/clients'

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    const result = await createFirstAccount(formData)
    if (result?.error) setError(result.error)
    setPending(false)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>This is the first account on this server. You will sign in with it from now on.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <div className="space-y-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" name="name" type="text" autoComplete="name" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
            />
            <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="operatorPassword">Server password</Label>
            <Input id="operatorPassword" name="operatorPassword" type="password" autoComplete="off" required />
            <p className="text-xs text-muted-foreground">The DASHBOARD_PASSWORD value set on the server.</p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Creating…' : 'Create account and sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
