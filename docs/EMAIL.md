# Sending mail

Open IpaaS sends very little mail: a password reset link, and the details of an
account an owner created for someone. It has no mail provider of its own, because
a self-hosted install is not a place to put one. You bring the provider.

## Configure one

Set a provider key, or SMTP details, and a From address:

```bash
EMAIL_FROM="Open IpaaS <no-reply@yourdomain.com>"
RESEND_API_KEY="re_..."
```

That is enough. `EMAIL_PROVIDER` is optional: with it empty, the first of these
that is filled in decides, in this order.

| Provider   | Variable                | Where to get it                                  |
| ---------- | ----------------------- | ------------------------------------------------ |
| `resend`   | `RESEND_API_KEY`        | https://resend.com/api-keys                       |
| `brevo`    | `BREVO_API_KEY`         | https://app.brevo.com/settings/keys/api           |
| `postmark` | `POSTMARK_SERVER_TOKEN` | https://account.postmarkapp.com                   |
| `sendgrid` | `SENDGRID_API_KEY`      | https://app.sendgrid.com/settings/api_keys        |
| `smtp`     | `SMTP_URL`, or `SMTP_HOST` with `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | your own mail server |

Set `EMAIL_PROVIDER` explicitly when more than one is present and you want a
specific one, or set it to `log` to turn sending off without deleting keys.

`SMTP_SECURE` is inferred from the port when you leave it empty: TLS from the
first byte on 465, STARTTLS on 587, which is what those ports mean.

## Configure none

This is a supported way to run. With nothing set, the message is written to the
server log, framed so you can find it:

```
  ─────────── email, not sent ───────────
  from:    Open IpaaS <no-reply@example.com>
  to:      fabio@example.com
  subject: Reset your password
  ...
```

`docker compose logs -f app` shows it. The screens that send mail tell the person
when this is what happened, so nobody is left waiting for a message that was
never sent. Password reset also still works without any mail at all: the operator
password, `DASHBOARD_PASSWORD`, sets a new password from the sign-in screen.

## When a provider accepts the key and refuses the message

Almost always the From address. Providers only send from a domain you verified
with them, so `EMAIL_FROM` has to match one. The refusal is quoted back to you on
screen and in the log, with the provider's own wording.

## Add a provider

Every hosted provider here is one HTTP POST, so they live in a table rather than
in a file each. In `src/lib/email/transports/http.ts`, add an entry:

```ts
mailgun: {
  name: 'mailgun',
  endpoint: 'https://api.mailgun.net/v3/YOUR_DOMAIN/messages',
  headers: (apiKey) => ({ Authorization: `Basic ${btoa(`api:${apiKey}`)}` }),
  body: (message, from) => ({ from: formatAddress(from), to: message.to, subject: message.subject, text: message.text }),
  idFrom: (payload) => (typeof payload.id === 'string' ? payload.id : undefined),
},
```

Then add it to `EMAIL_PROVIDERS` and `PROVIDER_KEY_VARIABLES` in
`src/lib/email/config.ts`, and to the table above. The test in
`src/tests/core/email.test.ts` walks every entry in the table, so a new provider
is covered by the existing cases as soon as it is listed.

A provider that is not an HTTP POST, or that needs a form encoded body, wants its
own file next to `smtp.ts` implementing `EmailTransport`. There are two methods
and one of them is a name.

## What the code guarantees

- `sendEmail` never throws. It returns `{ delivered, transport, id?, error? }`,
  and a provider that refuses the message is an outcome, not an exception.
- A half configured provider, a key without a From for instance, falls back to
  the log and reports which variable is missing. It does not fail silently and it
  does not take the feature down.
- Nothing in the dashboard displays a key. `emailStatus()` returns the provider
  name, the sender and the list of problems, and that is all it can return.
