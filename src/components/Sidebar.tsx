"use client"

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { NAV, isActive } from './nav-items'

/**
 * Navigation only.
 *
 * Signing out lives in the header next to the account it signs out of, instead
 * of at the bottom of a list of places to go. Hidden on narrow screens, where
 * MobileNav takes over.
 */
export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r bg-muted/20 p-4 md:flex">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-2">
        <Image src="/logo.png" alt="" width={28} height={28} className="rounded-lg" />
        <span className="text-sm font-semibold tracking-tight">Open IpaaS</span>
      </Link>

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

      <a
        href="/docs"
        className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <BookOpen className="h-4 w-4" />
        API reference
      </a>
    </aside>
  )
}
