import Image from 'next/image'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { MobileNav } from '@/components/MobileNav'
import { currentUser } from '@/lib/auth-session'
import { SignOutButton } from './components/SignOutButton'

// Reads the signed-in account, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /**
   * The proxy only checks the cookie's signature, which is all it can do in the
   * Edge Runtime. Here the account is looked up for real, so a session whose
   * account was deleted, or one issued before accounts existed, lands on the
   * login page instead of a dashboard whose every action would throw.
   */
  const user = await currentUser()
  if (!user) redirect('/login')

  return (
    <div className="dark flex min-h-screen w-full bg-background">
      <Sidebar />

      <div className="flex w-full flex-col">
        <header className="flex h-14 items-center gap-4 border-b bg-muted/10 px-4 md:px-6 lg:h-[60px]">
          {/* The sidebar carries the brand on wide screens; here it does on narrow ones. */}
          <div className="flex flex-1 items-center gap-2 md:hidden">
            <Image src="/logo.png" alt="" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-semibold tracking-tight">Open IpaaS</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user.name || user.email}</span>
            <SignOutButton />
          </div>
        </header>

        <MobileNav />

        {/* One place decides how wide a page is. Every page used to carry its
            own max-width, and the one that forgot was noticeably wider. */}
        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
