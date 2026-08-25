"use client"

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { login } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard/clients'

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    const result = await login(formData)
    // A successful login redirects, so reaching here means it failed.
    if (result?.error) setError(result.error)
    setPending(false)
  }

  return (
    <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Open IpaaS</CardTitle>
          <CardDescription>Sign in to the admin console.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={onSubmit} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
    </Card>
  )
}
