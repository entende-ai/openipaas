"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Check, Loader2 } from 'lucide-react'
import { revealAccountToken } from '@/app/actions/linked-account'

/**
 * Copies a connected account's token.
 *
 * The token is fetched when the button is pressed rather than rendered into the
 * page. It is a live credential: with it and an API key, anyone can read and
 * write that customer's data, so it should not sit in the HTML of a screen that
 * several people can open.
 */
export function CopyTokenButton({ linkedAccountId }: { linkedAccountId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'denied'>('idle')

  async function handleCopy() {
    setState('loading')
    const result = await revealAccountToken(linkedAccountId)

    if (!result?.token) {
      setState('denied')
      setTimeout(() => setState('idle'), 3000)
      return
    }

    await navigator.clipboard.writeText(result.token)
    setState('copied')
    setTimeout(() => setState('idle'), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      disabled={state === 'loading'}
      title={state === 'denied' ? 'Only an owner can copy this token' : 'Copy X-Account-Token'}
    >
      {state === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {state === 'copied' && <Check className="h-4 w-4 text-green-500" />}
      {state === 'denied' && <Copy className="h-4 w-4 text-destructive" />}
      {state === 'idle' && <Copy className="h-4 w-4 text-muted-foreground" />}
    </Button>
  )
}
