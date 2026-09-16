"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { runPlaygroundRequest, type PlaygroundResult } from '@/app/actions/test-api'
import {
  chosenPath,
  CUSTOM_PATH,
  explainResult,
  initialPathChoice,
  pathOptions,
  type PlaygroundOperation,
} from '@/lib/dashboard/playground'

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
  examples,
  docsUrl,
}: {
  linkedAccountId: string
  providerName: string
  operations: PlaygroundOperation[]
  passthrough: boolean
  baseUrl: string
  /** Real paths for this provider, so nobody has to guess one. */
  examples: readonly { path: string; label: string }[]
  docsUrl?: string
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(operations[0]?.id ?? (passthrough ? 'passthrough' : ''))
  // Starting on a real path beats starting on a slash nobody knows how to fill.
  const [choice, setChoice] = useState(() => initialPathChoice(examples))
  const [typedPath, setTypedPath] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<PlaygroundResult | null>(null)

  const options = pathOptions(examples)
  const path = chosenPath(choice, typedPath)

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
            Sends a real read request to {providerName}
            {' '}
            with this connection&apos;s credentials. Nothing is written.
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

                {options.length > 1 && (
                  <Select
                    value={choice}
                    items={Object.fromEntries(options.map((option) => [option.value, option.label]))}
                    onValueChange={(value) => setChoice(typeof value === 'string' ? value : CUSTOM_PATH)}
                  >
                    <SelectTrigger id="path" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex w-full items-center justify-between gap-4">
                            <span>{option.label}</span>
                            {option.value !== CUSTOM_PATH && (
                              <code className="font-mono text-xs text-muted-foreground">{option.value}</code>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Typed paths cover everything a manifest cannot list, which is
                    most of a provider's API. */}
                {choice === CUSTOM_PATH && (
                  <Input
                    id={options.length > 1 ? 'custom-path' : 'path'}
                    value={typedPath}
                    onChange={(event) => setTypedPath(event.target.value)}
                    placeholder="/contacts?limit=5"
                    spellCheck={false}
                    autoFocus={options.length > 1}
                  />
                )}

                <p className="text-xs text-muted-foreground">
                  Relative to {baseUrl || 'the provider'}.
                  {docsUrl ? (
                    <>
                      {' '}
                      <a
                        href={docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        {providerName} API reference
                      </a>{' '}
                      lists every path.
                    </>
                  ) : (
                    ' Check their API reference for the exact path.'
                  )}
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

                <p className="text-xs text-muted-foreground">
                  {explainResult({
                    status: result.status,
                    providerName,
                    data: result.data,
                    error: result.error,
                    path: selected === 'passthrough' ? path : undefined,
                  })}
                </p>

                <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                  <pre className="whitespace-pre-wrap break-words bg-muted p-4 font-mono text-xs">
                    {JSON.stringify(result.error ?? result.data, null, 2)}
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
