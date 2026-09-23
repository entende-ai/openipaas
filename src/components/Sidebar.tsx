"use client"

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { BookOpen, ExternalLink, UserRound } from 'lucide-react'
import { NAV, isActive } from './nav-items'
import { ClientSwitcher } from './dashboard/ClientSwitcher'

/**
 * The shell: which client, where to go, and who you are.
 *
 * The client sits above the navigation because it changes what the navigation
 * leads to. The account sits at the bottom, where every console puts it, and is
 * a link rather than a label: signing out, changing a password and the keys
 * that belong to nobody in particular all live behind it.
 */
export function Sidebar({
  clients,
  selectedClientId,
  user,
}: {
  clients: { id: string; name: string }[]
  selectedClientId: string | null
  user: { name: string | null; email: string; role: string }
}) {
  const pathname = usePathname()
  const onProfile = pathname.startsWith('/dashboard/profile')

  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-4 border-r bg-muted/20 p-4 md:flex">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1">
        <Image src="/logo.png" alt="" width={28} height={28} className="rounded-lg" />
        <span className="text-sm font-semibold tracking-tight">Open IpaaS</span>
      </Link>

      <ClientSwitcher clients={clients} selected={selectedClientId} />

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = isActive(pathname, item)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* New tab: the reference is something you read while working in the
          console, not somewhere you navigate away to. */}
      <a
        href="/docs"
        target="_blank"
        rel="noreferrer"
        className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <BookOpen className="h-4 w-4" />
        API reference
        <ExternalLink className="ml-auto h-3 w-3 opacity-60" />
      </a>

      <Link
        href="/dashboard/profile"
        aria-current={onProfile ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
          onProfile ? 'border-border bg-muted font-medium' : 'border-transparent hover:bg-muted/60'
        }`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
          <UserRound className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{user.name || user.email}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {user.name ? user.email : user.role.toLowerCase()}
          </span>
        </span>
      </Link>
    </aside>
  )
}
