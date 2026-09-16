import { LayoutGrid, Users, Link2, Activity } from 'lucide-react';

/** Shared by the sidebar and the mobile bar, so the two can never disagree. */
export const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/dashboard/clients', label: 'Clients & keys', icon: Users, exact: false },
  { href: '/dashboard/linked-accounts', label: 'Connections', icon: Link2, exact: false },
  { href: '/dashboard/logs', label: 'API logs', icon: Activity, exact: false },
];

export function isActive(pathname: string, item: { href: string; exact: boolean }): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
