"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { generateApiKey } from '@/app/actions/client'
import { FULL_ACCESS, READ_ONLY, SCOPE_RESOURCES } from '@/lib/scopes'

/** What the three choices mean, in the order an operator meets them. */
const ACCESS = {
  full: { label: 'Read and write', hint: 'Everything this client has connected.' },
  read: { label: 'Read only', hint: 'Lists and lookups. Safe to hand to an agent or a dashboard.' },
  custom: { label: 'Only some resources', hint: 'Pick exactly what this key may reach.' },
} as const

type Access = keyof typeof ACCESS

/**
 * Issues another key, named.
 *
 * A client can hold as many keys as it needs, and that is the point: one per
 * thing that calls, so revoking the agent's key does not take the backend down
 * with it. Unnamed, several keys are indistinguishable from each other except
 * by a prefix and a date, which makes revoking the right one a guess.
 *
 * Keys are stored as a SHA-256 digest, so the plaintext exists only in this
 * response. The dialog makes that one-time visibility explicit.
 */
export function GenerateKeyButton({ clientId }: { clientId: string }) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [access, setAccess] = useState<Access>('full')
  const [resources, setResources] = useState<string[]>([])
  const [mayWrite, setMayWrite] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [issuedKey, setIssuedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)

    const result = await generateApiKey(clientId, name, scopesFor())
    setIsLoading(false)

    if (result?.apiKey) {
      setNaming(false)
      setName('')
      setAccess('full')
      setResources([])
      setMayWrite(true)
      setIssuedKey(result.apiKey)
    }
  }

  function scopesFor(): string[] {
    if (access === 'full') return FULL_ACCESS
    if (access === 'read') return READ_ONLY

    // Nothing picked is nothing allowed, which the button prevents; falling
    // back to full access here would hand out the opposite of what was asked.
    return resources.flatMap((resource) => (mayWrite ? [`read:${resource}`, `write:${resource}`] : [`read:${resource}`]))
  }

  function toggleResource(resource: string) {
    setResources((current) =>
      current.includes(resource) ? current.filter((entry) => entry !== resource) : [...current, resource]
    )
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setNaming(true)}>
        Generate new key
      </Button>

      <Dialog open={naming} onOpenChange={(open) => !open && setNaming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription>
              This client can hold as many keys as it needs. One per thing that calls means you can revoke that one
              thing later without taking everything else down.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">What will use it?</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="AI agent, backend, Zapier…"
                autoFocus
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Optional, and the only way to tell two keys apart afterwards: the key itself is never shown again.
              </p>
            </div>

            <div className="space-y-2">
              <Label>What may it do?</Label>
              <div className="space-y-1">
                {(Object.keys(ACCESS) as Access[]).map((option) => (
                  <label key={option} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="access"
                      className="mt-1"
                      checked={access === option}
                      onChange={() => setAccess(option)}
                    />
                    <span>
                      {ACCESS[option].label}
                      <span className="block text-xs text-muted-foreground">{ACCESS[option].hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {access === 'custom' && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {SCOPE_RESOURCES.map((resource) => (
                    <label key={resource} className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={resources.includes(resource)}
                        onChange={() => toggleResource(resource)}
                      />
                      {resource}
                    </label>
                  ))}
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={mayWrite} onChange={(event) => setMayWrite(event.target.checked)} />
                  Allow writing, not only reading
                </label>
                <p className="text-xs text-muted-foreground">
                  passthrough is the provider own API, so a key that has it reaches everything that provider exposes,
                  whatever else you pick here.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNaming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || (access === 'custom' && resources.length === 0)}>
                {isLoading ? 'Generating…' : 'Generate'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={issuedKey !== null} onOpenChange={(open) => !open && setIssuedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>Copy it now: it is stored hashed and cannot be shown again.</DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">{issuedKey}</div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!issuedKey) return
                await navigator.clipboard.writeText(issuedKey)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button onClick={() => setIssuedKey(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
