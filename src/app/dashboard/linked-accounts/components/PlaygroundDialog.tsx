"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { runPlaygroundRequest, type PlaygroundResult } from '@/app/actions/test-api'
import type { PlaygroundOperation } from '@/lib/dashboard/playground'

/**
 * Runs a real request against a connected account.
 *
 * The old version always called GET /customers, so for a passthrough-only
 * provider it could only answer 501. It now offers what the provider actually
 * declares, plus the raw upstream API when passthrough is available.
 *
 * Reads only: a write from a test console would land in a real system.
 */
export function PlaygroundDialog({
  linkedAccountId,
  providerName,
  operations,
  passthrough,
  baseUrl,
}: {
  linkedAccountId: string
  providerName: string
  operations: PlaygroundOperation[]
  passthrough: boolean
  baseUrl: string
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(operations[0]?.id ?? (passthrough ? 'passthrough' : ''))
  const [path, setPath] = useState('/')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<PlaygroundResult | null>(null)

  const choices = [
    ...operations.map((operation) => ({ id: operation.id, label: operation.label, hint: `GET /api/unified/v1${operation.path}` })),
    ...(passthrough ? [{ id: 'passthrough', label: 'Raw provider API', hint: `GET ${baseUrl}…` }] : []),
  ]

  async function run() {
    setPending(true)
    setResult(null)
    try {
      setResult(await runPlaygroundRequest({ linkedAccountId, operationId: selected, path }))
    } catch (error) {
      setResult({
        success: false,
        status: 500,
        request: selected,
        error: (error as Error)?.message ?? 'The request could not be sent.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setResult(null)
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="secondary" />}>Playground</DialogTrigger>

      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Playground</DialogTitle>
          <DialogDescription>
            Sends a real read request to {providerName} with this connection&apos;s credentials. Nothing is written.
          </DialogDescription>
        </DialogHeader>

        {choices.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {providerName} exposes neither unified resources nor passthrough, so there is nothing to call yet.
          </p>
        ) : (
          <div className="flex flex-1 flex-col gap-4 overflow-hidden py-2">
            <div className="space-y-2">
              <Label htmlFor="operation">Request</Label>
              <div className="flex flex-col gap-1">
                {choices.map((choice) => (
                  <label
                    key={choice.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm transition-colors ${
                      selected === choice.id ? 'border-foreground/25 bg-muted/40' : 'border-transparent hover:bg-muted/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="operation"
                      value={choice.id}
                      checked={selected === choice.id}
                      onChange={() => setSelected(choice.id)}
                      className="accent-[#FDDE3F]"
                    />
                    <span className="flex-1">{choice.label}</span>
                    <code className="truncate font-mono text-xs text-muted-foreground">{choice.hint}</code>
                  </label>
                ))}
              </div>
            </div>

            {selected === 'passthrough' && (
              <div className="space-y-2">
                <Label htmlFor="path">Path</Label>
                <Input
                  id="path"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  placeholder="/contacts?limit=5"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Relative to {baseUrl || 'the provider'}. Check their API reference for the exact path.
                </p>
              </div>
            )}

            <div>
              <Button onClick={run} disabled={pending || !selected}>
                {pending ? 'Running…' : 'Send request'}
              </Button>
            </div>

            {result && (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={result.success ? 'default' : result.status >= 500 ? 'destructive' : 'secondary'}>
                    {result.status}
                  </Badge>
                  <code className="font-mono text-muted-foreground">{result.request}</code>
                  {'latencyMs' in result && <span className="text-muted-foreground">{result.latencyMs}ms</span>}
                </div>

                <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                  <pre className="whitespace-pre-wrap break-words bg-muted p-4 font-mono text-xs">
                    {JSON.stringify('data' in result ? result.data : result.error, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
