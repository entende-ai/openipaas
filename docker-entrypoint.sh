#!/bin/sh
set -e

PRISMA="./node_modules/.bin/prisma"

echo "Waiting for the database..."

# Connectivity only. Bounded, so a genuinely broken migration fails the boot
# instead of spinning forever.
ATTEMPTS=0
MAX_ATTEMPTS=30
until echo "SELECT 1;" | "$PRISMA" db execute --url "$DATABASE_URL" --stdin >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "Database did not become reachable after $MAX_ATTEMPTS attempts."
    echo "Check DATABASE_URL. Managed providers usually need ?sslmode=require."
    exit 1
  fi
  echo "  not ready yet ($ATTEMPTS/$MAX_ATTEMPTS)"
  sleep 2
done

echo "Applying migrations..."
"$PRISMA" migrate deploy

# DESTRUCTIVE: the seed wipes every table before inserting fixtures, so it never
# runs implicitly. docker-compose sets RUN_SEED=true for local development.
if [ "$RUN_SEED" = "true" ]; then
  # The seed refuses to touch a non-local database on its own, so a compose file
  # carried onto a server with RUN_SEED still set fails loudly instead of
  # erasing production.
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
