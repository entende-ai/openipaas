import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
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
    <div className="flex min-h-screen w-full bg-background dark">
      <Sidebar />
      <div className="flex flex-col w-full">
        <header className="h-14 lg:h-[60px] border-b flex items-center gap-4 px-6 bg-muted/10">
          <div className="flex-1">
            <h1 className="font-semibold text-sm">Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{user.name || user.email}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 flex flex-col gap-4 p-4 md:gap-8 md:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
