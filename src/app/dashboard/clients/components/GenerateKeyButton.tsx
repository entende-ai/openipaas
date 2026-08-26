"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { generateApiKey } from '@/app/actions/client'

/**
 * Keys are stored as a SHA-256 digest, so the plaintext exists only in this
 * response. The dialog makes that one-time visibility explicit.
 */
export function GenerateKeyButton({ clientId }: { clientId: string }) {
  const [isLoading, setIsLoading] = useState(false)
  const [issuedKey, setIssuedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    setIsLoading(true)
    const result = await generateApiKey(clientId)
    setIsLoading(false)
    if (result?.apiKey) setIssuedKey(result.apiKey)
  }

  async function copy() {
    if (!issuedKey) return
    await navigator.clipboard.writeText(issuedKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={isLoading}>
        {isLoading ? 'Generating…' : 'Generate new key'}
      </Button>

      <Dialog open={issuedKey !== null} onOpenChange={(open) => !open && setIssuedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy it now: it is stored hashed and cannot be shown again.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">{issuedKey}</div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button onClick={() => setIssuedKey(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
