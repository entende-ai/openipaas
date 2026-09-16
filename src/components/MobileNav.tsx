"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV, isActive } from './nav-items'

/** The sidebar is hidden below md, where this row replaces it. */
export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden">
      {NAV.map((item) => {
        const active = isActive(pathname, item)

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-colors ${
              active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
