import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/password';
import {
  asRole,
  canDestroy,
  canManageTeam,
  canRevealAccountToken,
  isOwner,
  lastSeen,
  roleLabel,
  wouldLeaveNoOwner,
} from '@/lib/dashboard/roles';

/**
 * Console accounts, with Prisma and the session stubbed.
 *
 * The decisions are what matter: who may create an account, what stops a
 * deployment from losing its last owner, and that a password set here is
 * hashed before it reaches the database.
 */

type User = { id: string; email: string; name: string | null; passwordHash: string; role: string };

const state = vi.hoisted(() => ({
  users: [] as User[],
  session: null as { id: string; email: string; name: string | null; role: string } | null,
  deleted: [] as string[],
  updates: [] as { id: string; data: Record<string, unknown> }[],
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    dashboardUser: {
      findMany: async () => state.users.map((user) => ({ ...user })),
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        state.users.find((user) => (where.email ? user.email === where.email : user.id === where.id)) ?? null,
      create: async ({ data }: { data: Omit<User, 'id'> }) => {
        const user = { id: `user-${state.users.length + 1}`, ...data };
        state.users.push(user);
        return user;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.updates.push({ id: where.id, data });
        const user = state.users.find((entry) => entry.id === where.id);
        if (user) Object.assign(user, data);
        return user;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.deleted.push(where.id);
        state.users = state.users.filter((user) => user.id !== where.id);
        return { id: where.id };
      },
    },
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@/lib/auth-session', () => ({
  requireDashboardSession: async () => {
    if (!state.session) throw new Error('Unauthorized');
    return state.session;
  },
  requireOwner: async () => {
    if (!state.session) throw new Error('Unauthorized');
    if (state.session.role !== 'OWNER') throw new Error('Forbidden');
    return state.session;
  },
}));

const { createTeamAccount, setTeamAccountRole, removeTeamAccount, changeOwnPassword } = await import(
  '@/app/actions/team'
);

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const OWNER = { id: 'user-1', email: 'owner@example.com', name: null, role: 'OWNER' };

beforeEach(async () => {
  state.users = [{ ...OWNER, passwordHash: await hashPassword('owner-password-1234') }];
  state.session = { ...OWNER };
  state.deleted = [];
  state.updates = [];
});

describe('the rules themselves', () => {
  it('treats anything it does not recognize as the least privileged role', () => {
    expect(asRole('OWNER')).toBe('OWNER');
    expect(asRole('ADMIN')).toBe('MEMBER');
    expect(asRole(null)).toBe('MEMBER');
    expect(isOwner(undefined)).toBe(false);
  });

  it('keeps managing, destroying and reading credentials with the owner', () => {
    expect(canManageTeam('OWNER')).toBe(true);
    expect(canManageTeam('MEMBER')).toBe(false);
    expect(canDestroy('MEMBER')).toBe(false);
    expect(canRevealAccountToken('MEMBER')).toBe(false);
    expect(roleLabel('MEMBER')).toBe('Member');
  });

  it('says plainly when somebody has never signed in', () => {
    const now = new Date('2026-09-16T12:00:00Z');

    expect(lastSeen(null, now)).toBe('has never signed in');
    expect(lastSeen(new Date('2026-09-16T10:00:00Z'), now)).toBe('last signed in 2 hours ago');
    // Database and app clocks drift; "in -3 minutes" would be nonsense.
    expect(lastSeen(new Date('2026-09-16T12:03:00Z'), now)).toBe('signed in just now');
  });

  it('knows when a change would leave nobody in charge', () => {
    const one = [{ id: 'a', role: 'OWNER' }];
    const two = [
      { id: 'a', role: 'OWNER' },
      { id: 'b', role: 'OWNER' },
    ];

    expect(wouldLeaveNoOwner(one, { userId: 'a', to: 'MEMBER' })).toBe(true);
    expect(wouldLeaveNoOwner(one, { userId: 'a', to: 'REMOVED' })).toBe(true);
    expect(wouldLeaveNoOwner(two, { userId: 'a', to: 'MEMBER' })).toBe(false);
    expect(wouldLeaveNoOwner(one, { userId: 'a', to: 'OWNER' })).toBe(false);
  });
});

describe('creating an account', () => {
  it('lets an owner add someone, hashed, never in the clear', async () => {
    const result = await createTeamAccount(
      form({ email: 'Colleague@Example.com ', name: 'Colleague', password: 'first-password-1234', role: 'MEMBER' })
    );

    expect(result).toMatchObject({ success: true });
    const created = state.users.at(-1)!;
    expect(created.email).toBe('colleague@example.com');
    expect(created.role).toBe('MEMBER');
    expect(created.passwordHash).not.toContain('first-password-1234');
    expect(await verifyPassword('first-password-1234', created.passwordHash)).toBe(true);
  });

  it('refuses a member trying to add anyone', async () => {
    state.session = { id: 'user-2', email: 'member@example.com', name: null, role: 'MEMBER' };

    await expect(createTeamAccount(form({ email: 'x@example.com', password: 'another-password-1' }))).rejects.toThrow(
      /Forbidden/
    );
    expect(state.users).toHaveLength(1);
  });

  it('refuses a duplicate email and a weak password', async () => {
    expect(await createTeamAccount(form({ email: 'owner@example.com', password: 'another-password-1' }))).toMatchObject({
      error: expect.stringContaining('already uses'),
    });
    expect(await createTeamAccount(form({ email: 'new@example.com', password: 'short' }))).toMatchObject({
      error: expect.stringContaining('at least'),
    });
    expect(state.users).toHaveLength(1);
  });

  it('refuses a role it does not know rather than storing it', async () => {
    await createTeamAccount(form({ email: 'new@example.com', password: 'first-password-1234', role: 'SUPERUSER' }));
    expect(state.users.at(-1)!.role).toBe('MEMBER');
  });
});

describe('roles and removal', () => {
  beforeEach(async () => {
    state.users.push({
      id: 'user-2',
      email: 'member@example.com',
      name: null,
      role: 'MEMBER',
      passwordHash: await hashPassword('member-password-1234'),
    });
  });

  it('promotes and demotes', async () => {
    expect(await setTeamAccountRole('user-2', 'OWNER')).toMatchObject({ success: true });
    expect(state.users.find((user) => user.id === 'user-2')!.role).toBe('OWNER');
  });

  // A console nobody can administer is not recoverable with DASHBOARD_PASSWORD,
  // which resets passwords and not roles.
  it('refuses to demote or remove the last owner', async () => {
    expect(await setTeamAccountRole('user-1', 'MEMBER')).toMatchObject({
      error: expect.stringContaining('at least one owner'),
    });
    expect(state.users.find((user) => user.id === 'user-1')!.role).toBe('OWNER');

    state.session = { id: 'user-2', email: 'member@example.com', name: null, role: 'OWNER' };
    state.users.find((user) => user.id === 'user-2')!.role = 'OWNER';
    state.users.find((user) => user.id === 'user-1')!.role = 'MEMBER';
    expect(await removeTeamAccount('user-2')).toMatchObject({ error: expect.stringContaining('own account') });
  });

  it('removes somebody else', async () => {
    expect(await removeTeamAccount('user-2')).toMatchObject({ success: true });
    expect(state.deleted).toEqual(['user-2']);
  });

  it('refuses a member trying to change roles or remove people', async () => {
    state.session = { id: 'user-2', email: 'member@example.com', name: null, role: 'MEMBER' };

    await expect(setTeamAccountRole('user-1', 'MEMBER')).rejects.toThrow(/Forbidden/);
    await expect(removeTeamAccount('user-1')).rejects.toThrow(/Forbidden/);
    expect(state.deleted).toEqual([]);
  });

  it('says so when the account is already gone', async () => {
    expect(await removeTeamAccount('user-404')).toMatchObject({ error: expect.stringContaining('no longer exists') });
  });
});

describe('changing your own password', () => {
  it('requires the current one', async () => {
    const result = await changeOwnPassword(
      form({ currentPassword: 'not-the-password', newPassword: 'a-new-password-1234' })
    );

    expect(result).toMatchObject({ error: expect.stringContaining('current password') });
    expect(state.updates).toEqual([]);
  });

  it('changes it, hashed', async () => {
    const result = await changeOwnPassword(
      form({ currentPassword: 'owner-password-1234', newPassword: 'a-new-password-1234' })
    );

    expect(result).toMatchObject({ success: true });
    const stored = state.users.find((user) => user.id === 'user-1')!.passwordHash;
    expect(await verifyPassword('a-new-password-1234', stored)).toBe(true);
    expect(await verifyPassword('owner-password-1234', stored)).toBe(false);
  });

  it('refuses a short password and a password that did not change', async () => {
    expect(await changeOwnPassword(form({ currentPassword: 'owner-password-1234', newPassword: 'short' }))).toMatchObject(
      { error: expect.stringContaining('at least') }
    );
    expect(
      await changeOwnPassword(form({ currentPassword: 'owner-password-1234', newPassword: 'owner-password-1234' }))
    ).toMatchObject({ error: expect.stringContaining('same') });
  });

  // A member changing their own password is the point of handing one over.
  it('works for a member too', async () => {
    state.users.push({
      id: 'user-2',
      email: 'member@example.com',
      name: null,
      role: 'MEMBER',
      passwordHash: await hashPassword('member-password-1234'),
    });
    state.session = { id: 'user-2', email: 'member@example.com', name: null, role: 'MEMBER' };

    expect(
      await changeOwnPassword(form({ currentPassword: 'member-password-1234', newPassword: 'member-new-pass-1234' }))
    ).toMatchObject({ success: true });
  });
});
