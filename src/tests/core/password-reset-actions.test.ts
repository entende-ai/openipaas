import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hashResetToken, RESET_REQUEST_COOLDOWN_SECONDS } from '@/lib/password-reset';

/**
 * The reset actions, with Prisma, mail and the session cookie stubbed.
 *
 * Three behaviours carry the security of this flow: asking for a link says the
 * same thing whether or not the account exists, a link works exactly once, and a
 * link that is replaced stops working. Each has its own test.
 */

type Token = { id: string; userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null; createdAt: Date };
type User = { id: string; email: string; name: string | null; passwordHash: string };

const state = vi.hoisted(() => ({
  users: [] as User[],
  tokens: [] as Token[],
  sent: [] as { to: string; subject: string; text: string }[],
  delivered: true,
  sessionsStarted: [] as string[],
  redirects: [] as string[],
  owner: true,
}));

function matches(where: Record<string, unknown>, token: Token): boolean {
  if (where.id && where.id !== token.id) return false;
  if (where.userId && where.userId !== token.userId) return false;
  if (where.tokenHash && where.tokenHash !== token.tokenHash) return false;
  if ('usedAt' in where && where.usedAt === null && token.usedAt !== null) return false;
  return true;
}

vi.mock('@/lib/prisma', () => ({
  default: {
    dashboardUser: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
        state.users.find((user) => (where.email ? user.email === where.email : user.id === where.id)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { passwordHash?: string } }) => {
        const user = state.users.find((entry) => entry.id === where.id)!;
        if (data.passwordHash) user.passwordHash = data.passwordHash;
        return user;
      },
    },
    passwordResetToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        state.tokens.find((token) => token.tokenHash === where.tokenHash) ?? null,
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        [...state.tokens].filter((token) => matches(where, token)).sort((a, b) => +b.createdAt - +a.createdAt)[0] ??
        null,
      create: async ({ data }: { data: Omit<Token, 'id' | 'usedAt' | 'createdAt'> }) => {
        const token = { id: `t-${state.tokens.length + 1}`, usedAt: null, createdAt: new Date(), ...data };
        state.tokens.push(token);
        return token;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: { usedAt: Date } }) => {
        const hit = state.tokens.filter((token) => matches(where, token));
        for (const token of hit) token.usedAt = data.usedAt;
        return { count: hit.length };
      },
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail: async (message: { to: string; subject: string; text: string }) => {
    state.sent.push(message);
    return state.delivered
      ? { delivered: true, transport: 'resend', id: 'm-1' }
      : { delivered: false, transport: 'log' };
  },
  emailStatus: () => ({
    provider: state.delivered ? 'resend' : 'log',
    from: 'a@b.com',
    canSend: state.delivered,
    problems: [],
    inferred: false,
  }),
}));

vi.mock('@/lib/dashboard/session-cookie', () => ({
  startSessionCookie: async (userId: string) => {
    state.sessionsStarted.push(userId);
  },
  safeNext: (next: string) => next,
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    state.redirects.push(path);
    // The real one throws to stop the action, and callers rely on that.
    throw new Error('NEXT_REDIRECT');
  },
}));

vi.mock('@/lib/auth-session', () => ({
  requireOwner: async () => {
    if (!state.owner) throw new Error('Only an owner can do that.');
    return { id: 'owner-1', role: 'OWNER' };
  },
}));

const { requestPasswordReset, completePasswordReset, checkResetToken, sendResetLinkTo } = await import(
  '@/app/actions/password-reset'
);

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

/** The token out of the link in the last message sent. */
function tokenFromLastEmail(): string {
  return state.sent.at(-1)!.text.match(/\/reset\/([A-Za-z0-9_-]+)/)![1];
}

beforeEach(() => {
  state.users = [{ id: 'u-1', email: 'fabio@example.com', name: 'Fabio', passwordHash: 'old-hash' }];
  state.tokens = [];
  state.sent = [];
  state.delivered = true;
  state.sessionsStarted = [];
  state.redirects = [];
  state.owner = true;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.openipaas.com';
});

describe('asking for a link', () => {
  it('emails one when the account exists', async () => {
    const result = await requestPasswordReset(form({ email: 'fabio@example.com' }));

    expect(result).toMatchObject({ message: expect.stringContaining('on its way') });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].to).toBe('fabio@example.com');
    expect(state.tokens).toHaveLength(1);
  });

  // Anything that answers differently is a way to list who has an account here.
  it('says exactly the same thing when it does not', async () => {
    const known = await requestPasswordReset(form({ email: 'fabio@example.com' }));
    const unknown = await requestPasswordReset(form({ email: 'nobody@example.com' }));

    expect(unknown).toEqual(known);
    expect(state.sent).toHaveLength(1);
  });

  it('is not fooled by the case of the address', async () => {
    await requestPasswordReset(form({ email: '  FABIO@Example.com ' }));
    expect(state.sent).toHaveLength(1);
  });

  it('stores only the hash of what it emailed', async () => {
    await requestPasswordReset(form({ email: 'fabio@example.com' }));
    const token = tokenFromLastEmail();

    expect(state.tokens[0].tokenHash).toBe(hashResetToken(token));
    expect(JSON.stringify(state.tokens)).not.toContain(token);
  });

  it('retires the link it replaces', async () => {
    await requestPasswordReset(form({ email: 'fabio@example.com' }));
    const first = tokenFromLastEmail();
    state.tokens[0].createdAt = new Date(Date.now() - RESET_REQUEST_COOLDOWN_SECONDS * 2000);

    await requestPasswordReset(form({ email: 'fabio@example.com' }));

    expect(state.tokens).toHaveLength(2);
    expect(await checkResetToken(first)).toEqual({ valid: false });
    expect(await checkResetToken(tokenFromLastEmail())).toEqual({ valid: true });
  });

  it('will not send a second one straight away', async () => {
    await requestPasswordReset(form({ email: 'fabio@example.com' }));
    const answer = await requestPasswordReset(form({ email: 'fabio@example.com' }));

    expect(answer).toMatchObject({ message: expect.stringContaining('on its way') });
    expect(state.sent).toHaveLength(1);
  });

  it('asks for an address when the field is empty', async () => {
    expect(await requestPasswordReset(form({ email: '   ' }))).toMatchObject({ error: expect.any(String) });
  });

  it('says so when this server cannot send mail', async () => {
    state.delivered = false;
    const result = await requestPasswordReset(form({ email: 'fabio@example.com' }));

    expect(result).toMatchObject({ message: expect.stringContaining('server log') });
  });
});

describe('using a link', () => {
  async function linkFor(email = 'fabio@example.com'): Promise<string> {
    await requestPasswordReset(form({ email }));
    return tokenFromLastEmail();
  }

  async function complete(token: string, password: string) {
    return completePasswordReset(form({ token, password })).catch((error: Error) => {
      // A successful reset redirects, which throws.
      if (error.message === 'NEXT_REDIRECT') return { redirected: true };
      throw error;
    });
  }

  it('sets the password and signs the person in', async () => {
    const token = await linkFor();

    expect(await complete(token, 'a-long-enough-password')).toEqual({ redirected: true });
    expect(state.users[0].passwordHash).not.toBe('old-hash');
    expect(state.sessionsStarted).toEqual(['u-1']);
    expect(state.redirects).toEqual(['/dashboard/clients']);
  });

  it('works once', async () => {
    const token = await linkFor();
    await complete(token, 'a-long-enough-password');
    const second = await complete(token, 'another-long-password');

    expect(second).toMatchObject({ error: expect.stringContaining('does not work any more') });
    expect(state.sessionsStarted).toEqual(['u-1']);
  });

  it('refuses a token that was never real, saying no more than that', async () => {
    const result = await complete('not-a-real-token', 'a-long-enough-password');
    expect(result).toMatchObject({ error: 'This link does not work any more. Ask for a new one.' });
  });

  it('refuses an expired one', async () => {
    const token = await linkFor();
    state.tokens[0].expiresAt = new Date(Date.now() - 1000);

    expect(await complete(token, 'a-long-enough-password')).toMatchObject({
      error: expect.stringContaining('does not work any more'),
    });
  });

  it('applies the password rule before spending the link', async () => {
    const token = await linkFor();

    expect(await complete(token, 'short')).toMatchObject({ error: expect.stringContaining('at least') });
    expect(await checkResetToken(token)).toEqual({ valid: true });
  });
});

describe('an owner sending a link', () => {
  it('emails it when mail works, and does not hand the token back', async () => {
    const result = await sendResetLinkTo('u-1');

    expect(result).toMatchObject({ message: expect.stringContaining('fabio@example.com') });
    expect(result).not.toHaveProperty('link');
    expect(state.sent).toHaveLength(1);
  });

  it('hands the link over when the server cannot send it', async () => {
    state.delivered = false;
    const result = (await sendResetLinkTo('u-1')) as { message: string; link?: string };

    expect(result.link).toContain('https://app.openipaas.com/reset/');
    expect(result.message).toContain('link');
  });

  it('refuses anyone who is not an owner', async () => {
    state.owner = false;
    await expect(sendResetLinkTo('u-1')).rejects.toThrow(/owner/);
    expect(state.sent).toEqual([]);
  });

  it('answers plainly for an account that is gone', async () => {
    expect(await sendResetLinkTo('u-404')).toMatchObject({ error: expect.stringContaining('no longer exists') });
    expect(state.tokens).toEqual([]);
  });
});
