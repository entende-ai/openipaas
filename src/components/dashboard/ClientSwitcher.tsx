"use client"

import { useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { selectWorkspace } from '@/app/actions/workspace'

const ALL = '__all__'

/**
 * The client every screen is about.
 *
 * Sits at the top of the sidebar, above the navigation, because it changes what
 * the navigation leads to rather than being one of the places it leads. Picking
 * one narrows connections, webhooks, logs and the overview to that client, the
 * way switching workspace does in any other console.
 */
export function ClientSwitcher({
  clients,
  selected,
}: {
  clients: { id: string; name: string }[]
  selected: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const labels = useMemo(
    () => ({ [ALL]: 'All clients', ...Object.fromEntries(clients.map((client) => [client.id, client.name])) }),
    [clients]
  )

  function onChange(value: unknown) {
    const next = value === ALL ? null : String(value)

    startTransition(async () => {
      await selectWorkspace(next)
      // The pages are server-rendered from the cookie, so they have to be asked
      // again; without this the sidebar changes and the page does not.
      router.refresh()
    })
  }

  if (clients.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" />
        No clients yet
      </div>
    )
  }

  return (
    <Select items={labels} value={selected ?? ALL} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-full" aria-label="Current client">
        <Building2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All clients</SelectItem>
        {clients.map((client) => (
          <SelectItem key={client.id} value={client.id}>
            {client.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
