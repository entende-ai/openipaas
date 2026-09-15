import { Suspense } from 'react'
import Image from 'next/image'
import prisma from '@/lib/prisma'
import { LoginForm } from './components/LoginForm'
import { FirstAccountForm } from './components/FirstAccountForm'

/**
 * Reads the account count, so it can never be prerendered at build time.
 *
 * A deployment with no account yet shows the setup form instead of a sign-in
 * form nobody could satisfy. Creating that first account still takes the
 * operator password, so finding this page first is not enough to claim it.
 */
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const hasAccount = (await prisma.dashboardUser.count()) > 0

  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* The brand yellow, as light rather than as a block of colour. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-[#FDDE3F] opacity-[0.07] blur-3xl"
      />

      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/logo.png" alt="" width={56} height={56} className="rounded-2xl" priority />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Open IpaaS</h1>
            <p className="text-sm text-muted-foreground">
              {hasAccount ? 'Admin console' : 'Set up your admin console'}
            </p>
          </div>
        </div>

        {/* The forms read ?next= via useSearchParams, which suspends. */}
        <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Loading…</div>}>
          {hasAccount ? <LoginForm /> : <FirstAccountForm />}
        </Suspense>

        <p className="text-center text-xs text-muted-foreground">
          One API for many business systems.{' '}
          <a className="underline underline-offset-4 hover:text-foreground" href="/docs">
            API reference
          </a>
        </p>
      </div>
    </div>
  )
}
