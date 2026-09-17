"use client"

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CardTitle } from '@/components/ui/card'
import { renameClient } from '@/app/actions/client'

/**
 * The client's name, editable in place.
 *
 * It was set once at creation and then fixed forever, which is wrong for the
 * one field on the card that exists purely for the people reading it. A dialog
 * for a single text field would be heavier than the edit itself.
 */
export function ClientName({ clientId, name }: { clientId: string; name: string }) {
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const result = await renameClient(clientId, new FormData(event.currentTarget))
    setPending(false)

    if (result && 'error' in result) {
      setError(result.error)
      return
    }
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <CardTitle className="text-base">{name}</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => setEditing(true)}
          title={`Rename ${name}`}
          aria-label={`Rename ${name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="name"
          defaultValue={name}
          required
          autoFocus
          className="h-8 w-56"
          aria-label="Client name"
          onKeyDown={(event) => {
            // Escape leaves without saving, which is what the key is for.
            if (event.key === 'Escape') setEditing(false)
          }}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  )
}
