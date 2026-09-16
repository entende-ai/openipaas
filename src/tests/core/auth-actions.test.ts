import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hashPassword } from '@/lib/password';
import { sessionSubject } from '@/lib/session-token';

/**
 * The sign-in actions, with the database and the cookie store stubbed.
 *
 * What matters here is the decisions, not Prisma: who is refused, what the
 * refusal says, and that a password never reaches the database in the clear.
 */

type User = { id: string; email: string; name: string | null; passwordHash: string; lastLoginAt: Date | null };
type Where = { id?: string; email?: string };
type Fields = Partial<Omit<User, 'id'>>;

const state = vi.hoisted(() => ({
  users: [] as User[],
  cookies: new Map<string, { value: string; options: Record<string, unknown> }>(),
  redirectedTo: null as string | null,
  updates: [] as { where: Where; data: Fields }[],
  creates: [] as Fields[],
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    dashboardUser: {
      count: async () => state.users.length,
      findUnique: async ({ where }: { where: Where }) =>
        state.users.find((u) => (where.email ? u.email === where.email : u.id === where.id)) ?? null,
      create: async ({ data }: { data: Fields }) => {
        const user = { id: `user-${state.users.length + 1}`, ...data } as User;
        state.creates.push(data);
        state.users.push(user);
        return user;
      },
      update: async ({ where, data }: { where: Where; data: Fields }) => {
        state.updates.push({ where, data });
        const user = state.users.find((u) => u.id === where.id);
        if (user) Object.assign(user, data);
        return user;
      },
    },
  },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { value: state.cookies.get(name)!.value } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) =>
      state.cookies.set(name, { value, options }),
    delete: (name: string) => state.cookies.delete(name),
  }),
}));

class Redirected extends Error {}

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    state.redirectedTo = url;
    // The real redirect() never returns either: it throws a control-flow signal.
    throw new Redirected(url);
  },
}));

const { login, createFirstAccount, resetPassword, logout } = await import('@/app/actions/auth');

const OPERATOR_PASSWORD = 'server-password-from-env';
const SESSION_COOKIE = 'openipaas_session';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Actions redirect on success, so a successful call throws by design. */
async function run(action: (data: FormData) => Promise<unknown>, fields: Record<string, string>) {
  try {
    return (await action(form(fields))) as { error?: string } | undefined;
  } catch (error) {
    if (error instanceof Redirected) return undefined;
    throw error;
  }
}

async function seedUser(email: string, password: string): Promise<User> {
  const user = {
    id: 'user-existing',
    email,
    name: null,
    passwordHash: await hashPassword(password),
    lastLoginAt: null,
  };
  state.users.push(user);
  return user;
}

beforeEach(() => {
  state.users = [];
  state.cookies = new Map();
  state.redirectedTo = null;
  state.updates = [];
  state.creates = [];
  vi.stubEnv('DASHBOARD_PASSWORD', OPERATOR_PASSWORD);
  vi.stubEnv('DASHBOARD_SESSION_SECRET', 'test-session-secret');
  vi.stubEnv('NODE_ENV', 'test');
});

describe('login', () => {
  it('signs in an account and issues a session that names it', async () => {
    await seedUser('tech@entende.ai', 'a-decent-password');

    const result = await run(login, { email: 'Tech@Entende.AI ', password: 'a-decent-password', next: '/dashboard/logs' });

    expect(result).toBeUndefined();
    expect(state.redirectedTo).toBe('/dashboard/logs');
    expect(await sessionSubject(state.cookies.get(SESSION_COOKIE)!.value)).toBe('user-existing');
    expect(state.cookies.get(SESSION_COOKIE)!.options).toMatchObject({ httpOnly: true, sameSite: 'lax' });
    expect(state.updates.at(-1)?.data.lastLoginAt).toBeInstanceOf(Date);
  });

  it('refuses the wrong password without saying the account exists', async () => {
    await seedUser('tech@entende.ai', 'a-decent-password');

    const result = await run(login, { email: 'tech@entende.ai', password: 'not-the-password' });

    expect(result?.error).toBe('Invalid email or password.');
    expect(state.cookies.has(SESSION_COOKIE)).toBe(false);
  });

  // The same message for an unknown address, so the form cannot be used to
  // find out who has an account.
  it('refuses an unknown email with the same message', async () => {
    const result = await run(login, { email: 'stranger@example.com', password: 'a-decent-password' });

    expect(result?.error).toBe('Invalid email or password.');
    expect(state.cookies.has(SESSION_COOKIE)).toBe(false);
  });

  it('never sends the visitor somewhere off this site', async () => {
    await seedUser('tech@entende.ai', 'a-decent-password');

    await run(login, { email: 'tech@entende.ai', password: 'a-decent-password', next: '//evil.example.com' });

    expect(state.redirectedTo).toBe('/dashboard/clients');
  });
});

describe('first account', () => {
  it('creates it, hashes the password, and signs in', async () => {
    const result = await run(createFirstAccount, {
      email: 'Tech@Entende.AI',
      password: 'a-decent-password',
      operatorPassword: OPERATOR_PASSWORD,
      name: ' Felipe ',
    });

    expect(result).toBeUndefined();
    expect(state.creates[0]).toMatchObject({ email: 'tech@entende.ai', name: 'Felipe' });
    expect(state.creates[0].passwordHash!).not.toContain('a-decent-password');
    expect(state.creates[0].passwordHash!.startsWith('scrypt$')).toBe(true);
    expect(state.cookies.has(SESSION_COOKIE)).toBe(true);
  });

  // Otherwise a public deployment belongs to whoever finds /login first.
  it('refuses without the server password', async () => {
    const result = await run(createFirstAccount, {
      email: 'stranger@example.com',
      password: 'a-decent-password',
      operatorPassword: 'guessed',
    });

    expect(result?.error).toBe('That server password is not correct.');
    expect(state.users).toHaveLength(0);
  });

  it('refuses once an account exists, even with the server password', async () => {
    await seedUser('tech@entende.ai', 'a-decent-password');

    const result = await run(createFirstAccount, {
      email: 'second@entende.ai',
      password: 'another-password',
      operatorPassword: OPERATOR_PASSWORD,
    });

    expect(result?.error).toMatch(/already exists/);
    expect(state.users).toHaveLength(1);
  });

  it('rejects a short password and a malformed email', async () => {
    expect(
      (await run(createFirstAccount, { email: 'tech@entende.ai', password: 'short', operatorPassword: OPERATOR_PASSWORD }))
        ?.error
    ).toMatch(/at least 10 characters/);

    expect(
      (await run(createFirstAccount, { email: 'tech', password: 'a-decent-password', operatorPassword: OPERATOR_PASSWORD }))
        ?.error
    ).toMatch(/valid email/);

    expect(state.users).toHaveLength(0);
  });
});

describe('password reset', () => {
  it('sets a new password with the server password and signs in', async () => {
    const user = await seedUser('tech@entende.ai', 'the-old-password');
    const oldHash = user.passwordHash;

    const result = await run(resetPassword, {
      email: 'tech@entende.ai',
      password: 'the-new-password',
      operatorPassword: OPERATOR_PASSWORD,
    });

    expect(result).toBeUndefined();
    expect(state.cookies.has(SESSION_COOKIE)).toBe(true);

    const { verifyPassword } = await import('@/lib/password');
    const newHash = state.updates.at(-1)!.data.passwordHash!;

    expect(newHash).not.toBe(oldHash);
    expect(await verifyPassword('the-new-password', newHash)).toBe(true);
    expect(await verifyPassword('the-old-password', newHash)).toBe(false);
  });

  it('refuses without the server password', async () => {
    await seedUser('tech@entende.ai', 'the-old-password');

    const result = await run(resetPassword, {
      email: 'tech@entende.ai',
      password: 'the-new-password',
      operatorPassword: 'guessed',
    });

    expect(result?.error).toBe('That server password is not correct.');
    expect(state.updates).toHaveLength(0);
  });
});

describe('logout', () => {
  it('drops the session cookie and returns to the login page', async () => {
    state.cookies.set(SESSION_COOKIE, { value: 'whatever', options: {} });

    await run(logout as unknown as (data: FormData) => Promise<unknown>, {});

    expect(state.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(state.redirectedTo).toBe('/login');
  });
});
