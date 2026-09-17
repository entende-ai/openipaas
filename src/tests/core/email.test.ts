import { describe, it, expect, vi } from 'vitest';
import { parseAddress, formatAddress, EmailDeliveryError } from '@/lib/email/types';
import { readEmailConfig, emailStatus, EMAIL_PROVIDERS, PROVIDER_KEY_VARIABLES } from '@/lib/email/config';
import { HTTP_PROVIDERS, httpTransport } from '@/lib/email/transports/http';
import { smtpOptions, parseSmtpUrl } from '@/lib/email/transports/smtp';
import { logTransport } from '@/lib/email/transports/log';
import { sendEmail, transportFor } from '@/lib/email';

/**
 * Configuring, choosing and driving a mail provider.
 *
 * The provider is whatever the operator of a given install happens to have, so
 * the behaviour that matters is that the environment picks one predictably, that
 * an incomplete one degrades to the log instead of throwing, and that each
 * provider's request is shaped the way its API documents.
 */

const MESSAGE = { to: 'fabio@example.com', subject: 'Reset your password', text: 'Open this link.' };
const FROM = { email: 'no-reply@openipaas.com', name: 'Open IpaaS' };

function respond(status: number, body: string): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe('an address', () => {
  it('splits a display name from the address', () => {
    expect(parseAddress('Open IpaaS <no-reply@openipaas.com>')).toEqual({
      email: 'no-reply@openipaas.com',
      name: 'Open IpaaS',
    });
  });

  it('takes a bare address as the address', () => {
    expect(parseAddress('  no-reply@openipaas.com ')).toEqual({ email: 'no-reply@openipaas.com' });
  });

  it('unquotes a quoted name', () => {
    expect(parseAddress('"Open IpaaS, Ltd" <hi@x.com>')).toEqual({ email: 'hi@x.com', name: 'Open IpaaS, Ltd' });
  });

  it('round trips', () => {
    expect(formatAddress(parseAddress('Open IpaaS <hi@x.com>'))).toBe('Open IpaaS <hi@x.com>');
    expect(formatAddress(parseAddress('hi@x.com'))).toBe('hi@x.com');
  });
});

describe('reading the configuration', () => {
  it('uses the provider named, whatever else is set', () => {
    const config = readEmailConfig({
      EMAIL_PROVIDER: 'brevo',
      EMAIL_FROM: 'a@b.com',
      BREVO_API_KEY: 'key',
      RESEND_API_KEY: 'other',
    } as NodeJS.ProcessEnv);

    expect(config).toMatchObject({ provider: 'brevo', apiKey: 'key', problems: [], inferred: false });
  });

  it('infers the provider from the key that is present', () => {
    for (const [provider, variable] of Object.entries(PROVIDER_KEY_VARIABLES)) {
      const config = readEmailConfig({ EMAIL_FROM: 'a@b.com', [variable]: 'key' } as NodeJS.ProcessEnv);
      expect(config).toMatchObject({ provider, apiKey: 'key', problems: [], inferred: true });
    }
  });

  it('infers smtp from either the url or the host', () => {
    expect(readEmailConfig({ EMAIL_FROM: 'a@b.com', SMTP_URL: 'smtp://h:25' } as NodeJS.ProcessEnv)).toMatchObject({
      provider: 'smtp',
      problems: [],
    });
    expect(readEmailConfig({ EMAIL_FROM: 'a@b.com', SMTP_HOST: 'mail.h' } as NodeJS.ProcessEnv)).toMatchObject({
      provider: 'smtp',
      problems: [],
    });
  });

  // A fresh clone has no mail account and still has to run.
  it('falls back to the log with nothing configured', () => {
    expect(readEmailConfig({} as NodeJS.ProcessEnv)).toMatchObject({ provider: 'log', problems: [], inferred: true });
    expect(emailStatus({} as NodeJS.ProcessEnv).canSend).toBe(false);
  });

  it('names the variable that is missing', () => {
    expect(readEmailConfig({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'a@b.com' } as NodeJS.ProcessEnv).problems).toEqual([
      'RESEND_API_KEY is not set.',
    ]);
    expect(readEmailConfig({ RESEND_API_KEY: 'key' } as NodeJS.ProcessEnv).problems).toEqual([
      'EMAIL_FROM is not set, so there is no address to send from.',
    ]);
    expect(readEmailConfig({ EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'a@b.com' } as NodeJS.ProcessEnv).problems).toEqual([
      'Set SMTP_URL, or SMTP_HOST with SMTP_PORT.',
    ]);
  });

  it('refuses a provider it does not have, and says which it has', () => {
    const config = readEmailConfig({ EMAIL_PROVIDER: 'mailchimp', EMAIL_FROM: 'a@b.com' } as NodeJS.ProcessEnv);
    expect(config.provider).toBe('log');
    expect(config.problems[0]).toContain('mailchimp');
    for (const known of EMAIL_PROVIDERS) expect(config.problems[0]).toContain(known);
  });

  it('reports a working provider as able to send, carrying no secret', () => {
    const status = emailStatus({ RESEND_API_KEY: 'sk-secret', EMAIL_FROM: 'a@b.com' } as NodeJS.ProcessEnv);
    expect(status).toEqual({ provider: 'resend', from: 'a@b.com', canSend: true, problems: [], inferred: true });
    expect(JSON.stringify(status)).not.toContain('sk-secret');
  });
});

describe('the http providers', () => {
  it('posts what each api documents', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const record = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    for (const spec of Object.values(HTTP_PROVIDERS)) {
      await httpTransport(spec, 'the-key', record).send(MESSAGE, FROM);
    }

    const sent = Object.fromEntries(
      Object.keys(HTTP_PROVIDERS).map((name, index) => [
        name,
        { url: calls[index].url, headers: calls[index].init.headers, body: JSON.parse(String(calls[index].init.body)) },
      ])
    );

    expect(sent.resend.url).toBe('https://api.resend.com/emails');
    expect(sent.resend.body).toMatchObject({ from: 'Open IpaaS <no-reply@openipaas.com>', to: ['fabio@example.com'] });

    expect(sent.brevo.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(sent.brevo.body).toMatchObject({
      sender: { email: 'no-reply@openipaas.com', name: 'Open IpaaS' },
      to: [{ email: 'fabio@example.com' }],
      textContent: 'Open this link.',
    });

    expect(sent.postmark.body).toMatchObject({ To: 'fabio@example.com', TextBody: 'Open this link.' });
    expect(sent.sendgrid.body).toMatchObject({
      personalizations: [{ to: [{ email: 'fabio@example.com' }] }],
      content: [{ type: 'text/plain', value: 'Open this link.' }],
    });
  });

  it('sends the key the way each provider wants it', async () => {
    const seen: Record<string, Record<string, string>> = {};
    for (const [name, spec] of Object.entries(HTTP_PROVIDERS)) seen[name] = spec.headers('the-key');

    expect(seen.resend).toEqual({ Authorization: 'Bearer the-key' });
    expect(seen.brevo).toEqual({ 'api-key': 'the-key' });
    expect(seen.postmark).toEqual({ 'X-Postmark-Server-Token': 'the-key' });
    expect(seen.sendgrid).toEqual({ Authorization: 'Bearer the-key' });
  });

  it('leaves out the fields the message does not carry', async () => {
    let body = '';
    const capture = (async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await httpTransport(HTTP_PROVIDERS.resend, 'k', capture).send(MESSAGE, FROM);
    expect(JSON.parse(body)).not.toHaveProperty('html');
    expect(JSON.parse(body)).not.toHaveProperty('reply_to');
  });

  it('reads back the provider id', async () => {
    const sent = await httpTransport(HTTP_PROVIDERS.resend, 'k', respond(200, '{"id":"abc-123"}')).send(MESSAGE, FROM);
    expect(sent.id).toBe('abc-123');
  });

  it('accepts a success with no body at all', async () => {
    await expect(
      httpTransport(HTTP_PROVIDERS.sendgrid, 'k', respond(202, '')).send(MESSAGE, FROM)
    ).resolves.toEqual({});
  });

  it('quotes a refusal back, trimmed', async () => {
    const long = JSON.stringify({ message: 'x'.repeat(500) });
    const error = await httpTransport(HTTP_PROVIDERS.resend, 'k', respond(422, long))
      .send(MESSAGE, FROM)
      .catch((thrown) => thrown as EmailDeliveryError);

    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect((error as EmailDeliveryError).status).toBe(422);
    expect((error as EmailDeliveryError).message).toContain('422');
    expect((error as EmailDeliveryError).message.length).toBeLessThan(400);
  });

  it('names the provider when the network is the problem', async () => {
    const dead = (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;

    await expect(httpTransport(HTTP_PROVIDERS.brevo, 'k', dead).send(MESSAGE, FROM)).rejects.toThrow(
      /Could not reach brevo/
    );
  });
});

describe('smtp options', () => {
  it('reads tls from the port when it is not stated', () => {
    expect(smtpOptions({ host: 'mail.h', port: 465 })).toMatchObject({ secure: true });
    expect(smtpOptions({ host: 'mail.h', port: 587 })).toMatchObject({ secure: false });
    expect(smtpOptions({ host: 'mail.h' })).toMatchObject({ port: 587, secure: false });
  });

  it('lets the operator override it', () => {
    expect(smtpOptions({ host: 'mail.h', port: 587, secure: true })).toMatchObject({ secure: true });
  });

  it('sends no auth when there is no user', () => {
    expect(smtpOptions({ host: 'mail.h' }).auth).toBeUndefined();
    expect(smtpOptions({ host: 'mail.h', user: 'u', password: 'p' }).auth).toEqual({ user: 'u', pass: 'p' });
  });

  it('reads a url into the same fields', () => {
    expect(parseSmtpUrl('smtps://user:pass@mail.example.com:465')).toEqual({
      host: 'mail.example.com',
      port: 465,
      user: 'user',
      password: 'pass',
      secure: true,
    });

    expect(smtpOptions({ url: 'smtp://mail.example.com' })).toMatchObject({
      host: 'mail.example.com',
      port: 587,
      secure: false,
      auth: undefined,
    });
  });

  // A password with an @ cannot appear in a URL unencoded.
  it('decodes credentials out of a url', () => {
    expect(parseSmtpUrl('smtp://a%40b.com:p%40ss%3Aword@mail.h:587')).toMatchObject({
      user: 'a@b.com',
      password: 'p@ss:word',
    });
  });

  it('lets a separate variable override what the url said', () => {
    expect(smtpOptions({ url: 'smtp://mail.h:25', port: 2525, secure: true })).toMatchObject({
      host: 'mail.h',
      port: 2525,
      secure: true,
    });
  });
});

describe('sending', () => {
  it('reports the log transport as not delivered', async () => {
    const lines: string[] = [];
    const outcome = await sendEmail(MESSAGE, {
      config: { provider: 'log', from: '', problems: [], inferred: true },
      write: (line) => lines.push(line),
    });

    expect(outcome).toMatchObject({ delivered: false, transport: 'log' });
    expect(lines.join('\n')).toContain('Open this link.');
    expect(lines.join('\n')).toContain('fabio@example.com');
  });

  it('still writes the message to the log when the provider is half configured', async () => {
    const lines: string[] = [];
    const outcome = await sendEmail(MESSAGE, {
      config: { provider: 'resend', from: 'a@b.com', problems: ['RESEND_API_KEY is not set.'], inferred: false },
      write: (line) => lines.push(line),
    });

    expect(outcome.delivered).toBe(false);
    expect(outcome.error).toContain('RESEND_API_KEY');
    expect(lines.join('\n')).toContain('Open this link.');
  });

  it('reports a delivery', async () => {
    const outcome = await sendEmail(MESSAGE, {
      config: { provider: 'resend', from: 'Open IpaaS <a@b.com>', apiKey: 'k', problems: [], inferred: false },
      fetchImpl: respond(200, '{"id":"sent-1"}'),
    });

    expect(outcome).toEqual({ delivered: true, transport: 'resend', id: 'sent-1' });
  });

  it('turns a provider failure into an outcome, not a throw', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const outcome = await sendEmail(MESSAGE, {
      config: { provider: 'resend', from: 'a@b.com', apiKey: 'k', problems: [], inferred: false },
      fetchImpl: respond(401, '{"message":"API key is invalid"}'),
    });

    expect(outcome.delivered).toBe(false);
    expect(outcome.error).toContain('API key is invalid');
    quiet.mockRestore();
  });

  it('builds the transport the configuration asks for', () => {
    const named = (provider: string, extra: Record<string, unknown> = {}) =>
      transportFor({ provider, from: 'a@b.com', problems: [], inferred: false, ...extra } as never).name;

    expect(named('resend', { apiKey: 'k' })).toBe('resend');
    expect(named('smtp', { smtp: { host: 'h' } })).toBe('smtp');
    expect(named('log')).toBe('log');
    expect(logTransport().name).toBe('log');
  });
});
