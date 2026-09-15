"use client"

import { useState } from 'react'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  const [pending, setPending] = useState(false)

  return (
    <form
      action={async () => {
        setPending(true)
        await logout()
      }}
    >
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
    </form>
  )
}
