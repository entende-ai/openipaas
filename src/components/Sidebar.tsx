import Link from 'next/link'
import { LayoutDashboard, Users, Link2, Activity, BookOpen, LogOut } from 'lucide-react'
import { logout } from '@/app/actions/auth'

const NAV = [
  { href: '/dashboard/clients', label: 'Clients & Keys', icon: Users },
  { href: '/dashboard/linked-accounts', label: 'Linked Accounts', icon: Link2 },
  { href: '/dashboard/logs', label: 'API Logs', icon: Activity },
  { href: '/docs', label: 'API Reference', icon: BookOpen },
]

export function Sidebar() {
  return (
    <div className="w-64 border-r bg-muted/30 min-h-screen p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2 px-2 py-4">
        <LayoutDashboard className="h-6 w-6 text-primary" />
        <span className="font-semibold text-lg tracking-tight">Open IpaaS</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary hover:bg-muted"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <form action={logout} className="mt-auto">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary hover:bg-muted"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </form>
    </div>
  )
}
