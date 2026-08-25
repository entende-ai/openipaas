#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

echo "⏳ Waiting for database to be ready..."

# Connectivity check only. Bounded, so a genuinely broken migration fails the
# boot instead of spinning forever.
ATTEMPTS=0
MAX_ATTEMPTS=30
until echo "SELECT 1;" | npx prisma db execute --url "$DATABASE_URL" --stdin >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "❌ Database did not become ready after $MAX_ATTEMPTS attempts."
    exit 1
  fi
  echo "🟡 Database is not ready yet - sleeping... ($ATTEMPTS/$MAX_ATTEMPTS)"
  sleep 2
done

echo "✅ Database is ready!"

echo "📦 Applying migrations..."
npx prisma migrate deploy

# The seed wipes every table before inserting fixtures, so it must never run
# implicitly. docker-compose sets RUN_SEED=true for local development only.
if [ "$RUN_SEED" = "true" ]; then
  echo "🌱 Running database seed (RUN_SEED=true)..."
  npx prisma db seed
else
  echo "⏭️  Skipping seed (set RUN_SEED=true to enable)."
fi

echo "🚀 Starting Next.js application..."
node server.js
