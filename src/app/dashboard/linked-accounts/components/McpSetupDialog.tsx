"use client"

import { useState } from 'react'
import { Bot, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { revealAccountToken } from '@/app/actions/linked-account'
import {
  claudeCodeCommand,
  curlCheck,
  mcpJsonSnippet,
  mcpServerName,
  TOKEN_PLACEHOLDER,
  type McpSetup,
} from '@/lib/dashboard/mcp-setup'

/**
 * Points an AI agent at this connection.
 *
 * The agent gets the tools this account supports and the documentation for
 * them, so the person setting it up only has to get two headers right. That is
 * exactly the kind of thing to hand over filled in rather than explain.
 *
 * The token is fetched when the dialog opens, never rendered into the page, and
 * only for an owner. For anyone else the commands are still correct, with a
 * placeholder where the token goes.
 */
export function McpSetupDialog({
  linkedAccountId,
  clientName,
  providerName,
  appUrl,
  mayRevealToken,
}: {
  linkedAccountId: string
  clientName: string
  providerName: string
  appUrl: string
  mayRevealToken: boolean
}) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onOpenChange(open: boolean) {
    if (!open || token || !mayRevealToken) return

    setLoading(true)
    const result = await revealAccountToken(linkedAccountId)
    setLoading(false)
    if (result?.token) setToken(result.token)
  }

  const setup: McpSetup = { appUrl, clientName, providerName, accountToken: token }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="secondary" />}>
        <Bot className="mr-1.5 h-3.5 w-3.5" />
        Connect an agent
      </DialogTrigger>

      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Connect an AI agent</DialogTitle>
          <DialogDescription>
            An agent reaches {providerName} for {clientName} over MCP, with the tools this account supports and the
            documentation for them. Nothing here is specific to this connection except the token.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto">
          {!mayRevealToken && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Only an owner can reveal the account token, so it is left as{' '}
              <code className="font-mono">{TOKEN_PLACEHOLDER}</code> below. Everything else is ready to run.
            </p>
          )}

          <Snippet
            title="Claude Code"
            hint={
              loading
                ? 'Reading the account token…'
                : 'Run this in a terminal. The agent then has this connection in every project.'
            }
            code={claudeCodeCommand(setup)}
          />

          <Snippet
            title="A repository your team shares"
            hint="Commit this as .mcp.json. The values stay as variables, so no key is in the commit."
            code={mcpJsonSnippet(setup)}
          />

          <Snippet
            title="Check it answers first"
            hint="Lists the tools this account offers. If this works, the agent will too."
            code={curlCheck(setup)}
          />

          <p className="text-xs text-muted-foreground">
            The API key is the one you copied when you created it. It is stored as a hash, so nobody can show it to you
            again: if it is lost, revoke it on the client and generate another. The agent will see this server as{' '}
            <code className="font-mono">{mcpServerName(clientName, providerName)}</code>.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Snippet({ title, hint, code }: { title: string; hint: string; code: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCopy}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 text-xs">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}
