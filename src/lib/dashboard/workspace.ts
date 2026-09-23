import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

/**
 * Which client the console is looking at.
 *
 * Every screen here is about one client's data: its connections, its webhook
 * endpoints, its calls. Showing all of them at once was fine with two clients
 * and stops being fine at ten, where finding the one you came for is the work.
 * So the console has a current client, picked once in the sidebar and kept in a
 * cookie, the way a workspace switcher works everywhere else.
 *
 * `null` means every client, which is still the right view for an operator
 * comparing them, and the right first impression on an install that has one.
 */

export const WORKSPACE_COOKIE = 'openipaas_client';

export interface Workspace {
  /** The selected client, or null for all of them. */
  clientId: string | null;
  name: string | null;
  clients: { id: string; name: string }[];
}

/**
 * The selection, validated against what exists.
 *
 * A cookie naming a deleted client would otherwise leave the console showing
 * nothing at all, with no hint why.
 */
export async function currentWorkspace(): Promise<Workspace> {
  const [clients, store] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    cookies(),
  ]);

  const selected = store.get(WORKSPACE_COOKIE)?.value ?? null;
  const match = selected ? clients.find((client) => client.id === selected) : undefined;

  return { clientId: match?.id ?? null, name: match?.name ?? null, clients };
}

/** `where` fragment for a query that should follow the selection. */
export function scopeTo(clientId: string | null): { clientId?: string } {
  return clientId ? { clientId } : {};
}
