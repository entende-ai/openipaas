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
 *
 * It carries a word, not just an icon. A masked value next to a bare icon reads
 * as decoration, and the token stops being something people know they can take.
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

  const LABEL = {
    idle: 'Copy',
    loading: 'Copying…',
    copied: 'Copied',
    denied: 'Owners only',
  } as const

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      disabled={state === 'loading'}
      title={state === 'denied' ? 'Only an owner can copy this token' : 'Copy the connection token (X-Account-Token)'}
    >
      {state === 'loading' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {state === 'copied' && <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" />}
      {state === 'denied' && <Copy className="mr-1.5 h-3.5 w-3.5 text-destructive" />}
      {state === 'idle' && <Copy className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />}
      {LABEL[state]}
    </Button>
  )
}
