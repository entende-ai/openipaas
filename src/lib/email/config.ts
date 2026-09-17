/**
 * Which mail provider this deployment uses, read from the environment.
 *
 * Self-hosted installs do not share a mail provider the way a SaaS does: one
 * operator has a Resend key, the next has Brevo, the next has the SMTP details
 * of a box they already run. So the provider is configuration, the set of
 * supported ones is a table, and adding to that table is the whole job of
 * supporting a new one.
 *
 * Nothing here throws. A deployment with no mail configured is a normal,
 * supported deployment: it falls back to writing the message to the log, and
 * the flows that would have sent mail say so rather than pretending.
 */

export const EMAIL_PROVIDERS = ['resend', 'brevo', 'postmark', 'sendgrid', 'smtp', 'log'] as const;

export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number];

/** The variable each API-key provider reads, and what infers it when unset. */
export const PROVIDER_KEY_VARIABLES: Record<Exclude<EmailProviderName, 'smtp' | 'log'>, string> = {
  resend: 'RESEND_API_KEY',
  brevo: 'BREVO_API_KEY',
  postmark: 'POSTMARK_SERVER_TOKEN',
  sendgrid: 'SENDGRID_API_KEY',
};

export interface SmtpConfig {
  /** A full smtp:// or smtps:// URL, which is how most hosts hand it over. */
  url?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  /** TLS from the first byte, as port 465 wants. */
  secure?: boolean;
}

export interface EmailConfig {
  provider: EmailProviderName;
  /** The From header, exactly as configured. Empty only when unconfigured. */
  from: string;
  apiKey?: string;
  smtp?: SmtpConfig;
  /**
   * Why this deployment cannot send. Empty means it can. Written for the
   * operator reading the Team page, so each line names the variable to set.
   */
  problems: string[];
  /** True when nothing was configured and 'log' was inferred, not chosen. */
  inferred: boolean;
}

function value(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] || '').trim();
}

/** The provider an operator named, or the one their variables imply. */
function chooseProvider(env: NodeJS.ProcessEnv): { provider: EmailProviderName; inferred: boolean; problem?: string } {
  const named = value(env, 'EMAIL_PROVIDER').toLowerCase();

  if (named) {
    if ((EMAIL_PROVIDERS as readonly string[]).includes(named)) {
      return { provider: named as EmailProviderName, inferred: false };
    }
    return {
      provider: 'log',
      inferred: false,
      problem: `EMAIL_PROVIDER is set to "${named}", which is not one of: ${EMAIL_PROVIDERS.join(', ')}.`,
    };
  }

  for (const [provider, variable] of Object.entries(PROVIDER_KEY_VARIABLES)) {
    if (value(env, variable)) return { provider: provider as EmailProviderName, inferred: true };
  }

  if (value(env, 'SMTP_URL') || value(env, 'SMTP_HOST')) return { provider: 'smtp', inferred: true };

  return { provider: 'log', inferred: true };
}

function readSmtp(env: NodeJS.ProcessEnv): SmtpConfig {
  const port = Number(value(env, 'SMTP_PORT'));
  const secure = value(env, 'SMTP_SECURE').toLowerCase();

  return {
    url: value(env, 'SMTP_URL') || undefined,
    host: value(env, 'SMTP_HOST') || undefined,
    port: Number.isFinite(port) && port > 0 ? port : undefined,
    user: value(env, 'SMTP_USER') || undefined,
    password: value(env, 'SMTP_PASSWORD') || undefined,
    // Unset means: infer from the port, which nodemailer does with 465.
    secure: secure ? secure === 'true' || secure === '1' : undefined,
  };
}

export function readEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const { provider, inferred, problem } = chooseProvider(env);
  const from = value(env, 'EMAIL_FROM');
  const problems = problem ? [problem] : [];

  if (provider === 'log') {
    return { provider, from, problems, inferred };
  }

  if (!from) problems.push('EMAIL_FROM is not set, so there is no address to send from.');

  if (provider === 'smtp') {
    const smtp = readSmtp(env);
    if (!smtp.url && !smtp.host) problems.push('Set SMTP_URL, or SMTP_HOST with SMTP_PORT.');
    return { provider, from, smtp, problems, inferred };
  }

  const variable = PROVIDER_KEY_VARIABLES[provider];
  const apiKey = value(env, variable);
  if (!apiKey) problems.push(`${variable} is not set.`);

  return { provider, from, apiKey, problems, inferred };
}

/**
 * What the dashboard shows. Deliberately carries no secret: the provider name,
 * the sender, and what is missing.
 */
export interface EmailStatus {
  provider: EmailProviderName;
  from: string;
  canSend: boolean;
  problems: string[];
  inferred: boolean;
}

export function emailStatus(env: NodeJS.ProcessEnv = process.env): EmailStatus {
  const config = readEmailConfig(env);

  return {
    provider: config.provider,
    from: config.from,
    // The log provider is configured correctly and still sends nothing.
    canSend: config.provider !== 'log' && config.problems.length === 0,
    problems: config.problems,
    inferred: config.inferred,
  };
}
