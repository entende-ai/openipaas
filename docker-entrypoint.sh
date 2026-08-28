#!/bin/sh
set -e

# Invoked through node rather than node_modules/.bin/prisma. That path is a
# symlink in a normal install, and Docker COPY dereferences symlinks, which
# leaves the CLI resolving its own bundled assets from the wrong directory.
PRISMA="node ./node_modules/prisma/build/index.js"

# Configuration errors are checked before the retry loop, because retrying is
# only ever right for a database that is still starting. An unset variable will
# read exactly the same on the thirtieth attempt as on the first, and burying
# that under a minute of identical stack traces hides the one line that matters.
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set, so there is nothing to connect to."
  echo ""
  echo "On Railway: add the Postgres plugin, then reference it from this"
  echo "service as \${{Postgres.DATABASE_URL}}. Adding the plugin alone does"
  echo "not expose it to other services."
  echo ""
  echo "Elsewhere: pass it with -e DATABASE_URL=... or an --env-file."
  exit 1
fi

# Applying the migrations is also the readiness check: it fails while the
# database is unreachable and succeeds once it is, so a separate probe would
# only add a second thing that can be wrong.
#
# An earlier version probed with `prisma db execute` and sent both stdout and
# stderr to /dev/null, so when it failed the log said "not ready yet" thirty
# times and never once said why. Errors are printed as they happen.
echo "Applying migrations..."

ATTEMPTS=0
MAX_ATTEMPTS=30
until $PRISMA migrate deploy 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo ""
    echo "Migrations failed after $MAX_ATTEMPTS attempts. The error above is the reason."
    echo "If it is a connection error, check DATABASE_URL. Managed providers"
    echo "usually need ?sslmode=require."
    exit 1
  fi
  echo "  retrying in 2s ($ATTEMPTS/$MAX_ATTEMPTS)"
  sleep 2
done

# DESTRUCTIVE: the seed wipes every table before inserting fixtures, so it never
# runs implicitly. docker-compose sets RUN_SEED=true for local development.
if [ "$RUN_SEED" = "true" ]; then
  # prisma/seed-guard.ts refuses any database that is not demonstrably
  # disposable, so a compose file carried onto a server with RUN_SEED still set
  # fails loudly instead of erasing production.
  echo "Seeding (RUN_SEED=true, this wipes existing data)..."

  # prisma/seed.js is built into the image; the .ts path is for running this
  # script outside Docker, where tsx is available.
  if [ -f prisma/seed.js ]; then
    node prisma/seed.js
  else
    $PRISMA db seed
  fi
else
  echo "Skipping seed (set RUN_SEED=true to enable)."
fi

echo "Starting..."
exec node server.js
