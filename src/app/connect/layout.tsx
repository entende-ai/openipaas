import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Connect an account',
  // An invitation link should not turn up in a search result.
  robots: { index: false, follow: false },
}

/**
 * The hosted pages, outside the console.
 *
 * No sidebar, no navigation, nothing that leads anywhere: this is one screen
 * shown to somebody else's customer, inside somebody else's product. Anything
 * that invites them to explore our dashboard is a way for them to end up
 * somewhere they have no account for.
 */
export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
