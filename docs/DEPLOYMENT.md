# Deployment

Open IpaaS is two deployments, not one.

| Piece | Repository | What it needs |
| --- | --- | --- |
| Marketing site | [openipaas-web](https://github.com/entende-ai/openipaas-web) | Static files. Any CDN or object store |
| Application: unified API, dashboard, `/docs` | this one | A running process, PostgreSQL, and Redis once there is more than one instance |

They are separate because their requirements have nothing in common. The site is
HTML that never changes between requests, so it belongs on a CDN, costs nothing
and cannot go down in an interesting way. The application holds credentials,
runs migrations and talks to upstream APIs. Deploying them together would mean a
copy edit on the landing page redeploys the thing brokering access to your
customers' ERP accounts.

A common arrangement is `openipaas.com` for the site and `app.openipaas.com` for
the application, but nothing in the code requires it. The site reaches the
application only through `NEXT_PUBLIC_APP_URL`, set at build time.

## Before the first deploy

Generate real secrets:

```bash
npm run setup:env -- --print
```

The development defaults in `docker-compose.yml` and `.env.example` are
published in this repository. The application refuses to start in production
while any of them is still set, so a copied compose file fails at boot instead
of running exposed. See `src/lib/env-guard.ts`.

**`CREDENTIALS_ENCRYPTION_KEY` is not a rotatable setting.** It decrypts every
stored provider token. Losing it means every connected account has to reconnect
through OAuth again. Back it up wherever you keep things you cannot regenerate.

## The application

The image is built from the `Dockerfile` at the root. Its entrypoint waits for
the database, applies migrations with `prisma migrate deploy`, and starts the
server. Migrations are additive, so a deploy does not need a maintenance window
and a rollback does not need a down migration.

### Railway

Railway builds the `Dockerfile` on its own, so there is nothing to configure
beyond the service itself.

1. New project, deploy from this repository.
2. Add the **PostgreSQL** plugin.
3. In **your service's** Variables tab, add:

   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   ```

4. Add the **Redis** plugin if you will run more than one instance, and
   reference it the same way as `REDIS_URL = ${{Redis.REDIS_URL}}`.
5. Set the remaining variables from the table below.
6. Generate a domain, then set `NEXT_PUBLIC_APP_URL` to that URL and redeploy.

Step 3 is the one that catches people, this documentation included: **adding
the plugin does not give your service the variable.** Railway sets
`DATABASE_URL` on the Postgres service, and services do not share an
environment. Without the explicit reference the app boots with nothing to
connect to, and Prisma reports it as a schema validation error rather than a
missing configuration one.

Step 6 is genuinely two passes: the OAuth redirect URI is built from
`NEXT_PUBLIC_APP_URL`, and you cannot know the URL until the service exists.

### Coolify, Render, Fly, a plain Docker host

Same image, same variables. On a plain host:

```bash
docker build -t openipaas .
docker run -p 3000:3000 --env-file .env openipaas
```

`docker-compose.yml` is for local development. It ships a database, a Redis and
known secrets, none of which belong on a server.

### Variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Managed Postgres usually needs `?sslmode=require` |
| `NEXT_PUBLIC_APP_URL` | yes | The public URL. Builds the OAuth redirect URI |
| `CREDENTIALS_ENCRYPTION_KEY` | yes | 32 bytes, base64 or hex |
| `DASHBOARD_PASSWORD` | yes | The operator secret: creates the first account and resets forgotten passwords. Not how people sign in |
| `DASHBOARD_SESSION_SECRET` | yes | Changing it logs everyone out, which is how you revoke sessions |
| `INTERNAL_JOB_SECRET` | yes | Authorizes the webhook delivery job |
| `REDIS_URL` | for >1 instance | Without it, rate limiting and idempotency are per process |
| `API_RATE_LIMIT_PER_MINUTE` | no | Defaults to 600 |
| `<SLUG>_CLIENT_ID` / `<SLUG>_CLIENT_SECRET` | per provider | From the provider's developer portal |
| `RUN_SEED` | no | Development only. Wipes every table |

### Running more than one instance

`REDIS_URL` stops being optional. Rate limiting and idempotency keys fall back
to process memory without it, and two instances each keeping their own count
means the real ceiling is twice what you configured, while a retried request can
land on an instance that never saw the first attempt and so runs it twice.

### After deploying

- `GET /api/unified/v1/providers` returns the catalog. It needs no credentials
  and is a good health check.
- `/docs` serves the API reference generated from the running code.
- `/dashboard` is where clients, API keys and connected accounts are managed.

### The first sign-in

People sign in with an email and a password, kept as a scrypt hash in the
database. A fresh deployment has no account, so `/login` offers to create one,
and asks for `DASHBOARD_PASSWORD` to prove the person setting it up owns the
deployment. Do this before announcing the URL. Once an account exists, the
setup form is gone for good.

That first account is an **owner**. Everyone else is added from **Team** in the
console.

Forgotten passwords are reset on the same page, again with
`DASHBOARD_PASSWORD`. There is no recovery email, because a self-hosted install
has no mail server to send one from.

### Adding your colleagues

**Team** lists everyone who can sign in. An owner creates the account with a
first password and passes it on privately; the person changes it themselves
under **Your password**, and from then on the owner does not know it. There are
no invitation emails, for the same reason there is no password recovery email.

Two roles:

| | Owner | Member |
| --- | --- | --- |
| Clients, API keys, connecting accounts, playground, logs | yes | yes |
| Revoke an API key, disconnect an account | yes | no |
| Copy a connected account's token | yes | no |
| Add, promote, demote or remove people | yes | no |

The one-way actions are the owner's, because revoking a key breaks whatever is
calling with it and disconnecting an account means the end customer has to
authorize the app again.

A deployment always keeps at least one owner: the last one cannot be demoted or
removed, and nobody can remove their own account.

What this does **not** do yet: everyone sees every client. Restricting who sees
which customer is [issue #32](https://github.com/entende-ai/openipaas/issues/32)
and [issue #33](https://github.com/entende-ai/openipaas/issues/33). Add people
you would trust with the whole console.

Removing an account stops the next dashboard request, not the current session
token, which expires within 12 hours. For an urgent removal, rotate
`DASHBOARD_SESSION_SECRET`, which signs everyone out.

### Connecting a provider

For each one, register an OAuth application in its developer portal with:

```
<NEXT_PUBLIC_APP_URL>/api/oauth/callback/<provider-slug>
```

The slug is the manifest slug lowercased with underscores replaced by hyphens,
so `CONTA_AZUL` becomes `conta-azul`. Set `CONTA_AZUL_CLIENT_ID` and
`CONTA_AZUL_CLIENT_SECRET`, and the provider becomes connectable with no code
change.

A mismatch here, usually `http` against `https` or a trailing slash, is the
single most common reason an otherwise correct OAuth flow fails.

Every deployment registers its own apps. The hosted instance's credentials
belong to it and are not shared, so a self-hosted Open IpaaS needs its own
pair for each provider it offers.

**RD Station CRM.** Apps live in the RD Station App Store publisher area,
<https://appstore.rdstation.com/pt-BR/publisher>, and logging in there takes
an RD Station Marketing account, even though the app is for the CRM product.
Create a private app for RD Station CRM, register
`<NEXT_PUBLIC_APP_URL>/api/oauth/callback/rd-station-crm` as its callback,
and set `RD_STATION_CRM_CLIENT_ID` and `RD_STATION_CRM_CLIENT_SECRET`. RD
rotates the refresh token on every use, which Open IpaaS already handles.

## The site

From the [openipaas-web](https://github.com/entende-ai/openipaas-web)
repository. The build is a static export, so:

- **Cloudflare Pages**: build `npm run build`, output directory `out`
- **Railway, Coolify, any Docker host**: the repository's `Dockerfile` serves
  `out/` with nginx
- **Anything else**: copy `out/` to the document root

Set `NEXT_PUBLIC_APP_URL` to wherever the application ended up. Static exports
bake it in at build time, so changing it needs a rebuild, not a restart.

## Upgrading

```bash
docker pull ghcr.io/entende-ai/openipaas:latest
```

Migrations run on boot. Read the release notes first when the minor version
changes.
