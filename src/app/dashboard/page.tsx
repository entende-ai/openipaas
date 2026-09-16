import { redirect } from 'next/navigation'

/**
 * /dashboard had no page of its own, so the obvious URL answered 404, and so
 * did signing in from it: the login form sends you back where you came from.
 *
 * Clients and keys is the first thing anyone needs, so it is the landing page.
 */
export default function DashboardIndex() {
  redirect('/dashboard/clients')
}
