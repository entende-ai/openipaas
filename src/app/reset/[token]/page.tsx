import Image from 'next/image'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import { hashResetToken, resetTokenProblem, RESET_TOKEN_TTL_MINUTES } from '@/lib/password-reset'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ResetPasswordForm } from './ResetPasswordForm'

/**
 * The page a reset link opens.
 *
 * The token is checked before the form is drawn, so a dead link says so instead
 * of taking a password first. It is checked again when the form is submitted,
 * because the minutes in between are enough for it to be used elsewhere.
 */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

export default async function ResetPage({ params }: Props) {
  const { token } = await params

  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { expiresAt: true, usedAt: true },
  })

  // Never real, already used and long expired all read the same from here.
  const dead = resetTokenProblem(stored) !== null

  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-[#FDDE3F] opacity-[0.07] blur-3xl"
      />

      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/logo.png" alt="" width={56} height={56} className="rounded-2xl" priority />
          <h1 className="text-xl font-semibold tracking-tight">Open IpaaS</h1>
        </div>

        {dead ? (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>This link does not work</CardTitle>
              <CardDescription>
                A reset link is good once and for {RESET_TOKEN_TTL_MINUTES} minutes. This one has been used, or it has
                expired.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/login"
                className="text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground"
              >
                Ask for a new one
              </Link>
            </CardContent>
          </Card>
        ) : (
          <ResetPasswordForm token={token} />
        )}
      </div>
    </div>
  )
}
