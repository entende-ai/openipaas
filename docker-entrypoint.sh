#!/bin/sh
set -e

PRISMA="./node_modules/.bin/prisma"

# Applying the migrations is also the readiness check: it fails while the
# database is unreachable and succeeds once it is, so a separate probe would
# only add a second thing that can be wrong.
#
# The previous version probed with `prisma db execute` and sent both stdout and
# stderr to /dev/null, so when it failed the log said "not ready yet" thirty
# times and never once said why. Errors are printed here, and the last attempt
# is left unredirected so its output is the reason the boot failed.
echo "Applying migrations..."

ATTEMPTS=0
MAX_ATTEMPTS=30
until "$PRISMA" migrate deploy 2>&1; do
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
    "$PRISMA" db seed
  fi
else
  echo "Skipping seed (set RUN_SEED=true to enable)."
fi

echo "Starting..."
exec node server.js
