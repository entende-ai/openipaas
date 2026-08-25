import { Suspense } from 'react'
import { LoginForm } from './components/LoginForm'

/**
 * The form reads ?next= via useSearchParams, which suspends during prerender.
 * The Suspense boundary lets the shell stay static while the form hydrates.
 */
export default function LoginPage() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense fallback={<div className="text-muted-foreground text-sm">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
