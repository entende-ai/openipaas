# Debian, not Alpine. Alpine is musl, and the lockfile pins
# @tailwindcss/oxide-linux-x64-gnu, the glibc build, added in 690b4b9 to fix
# the Vercel build. On musl that binding cannot load and `next build` dies with
# "Cannot find module @tailwindcss/oxide-linux-x64-musl".
#
# Prisma has the same split: on Alpine it fails to detect libssl and falls back
# to an openssl-1.1.x engine that does not match the system.
#
# Every stage shares this base. Prisma picks its query engine by detecting the
# installed OpenSSL, and it does that during `prisma generate` at build time,
# not at boot. When openssl was installed only in the runtime stage, generate
# ran blind, warned "failed to detect the libssl/openssl version, defaulting to
# openssl-1.1.x", and baked a reference to an engine that does not exist on
# bookworm:
#   Unable to require(.prisma/client/libquery_engine-debian-openssl-1.1.x.so.node)
# The build still succeeded, because no page queries the database at build
# time. It broke on the first real query instead.
FROM node:20-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Stage 1: dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# ci, not install: the lockfile is the point of shipping one.
RUN npm ci

# Stage 2: build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` already runs prisma generate.
RUN npm run build

# The seed is written in TypeScript and normally runs through tsx, which is a
# dev dependency. Bundling it here keeps the runtime image free of a TypeScript
# toolchain while leaving the seed runnable inside the container.
RUN npx esbuild prisma/seed.ts \
      --bundle --platform=node --target=node20 \
      --external:@prisma/client \
      --outfile=prisma/seed.js

# Stage 3: runtime
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next's standalone output carries its own minimal node_modules and a copy of
# the resolved config, so next.config.ts is deliberately not copied here.
COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/.next/static ./.next/static
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/prisma ./prisma

# The entrypoint runs `prisma migrate deploy` on boot. Copying the CLI from the
# builder keeps that offline and pinned to the lockfile; without it, npx would
# fetch a floating version from the network on every container start.
#
# node_modules/.bin/prisma is deliberately not copied. It is a symlink to
# ../prisma/build/index.js, and COPY dereferences symlinks, so it would land as
# a real file inside .bin/ and then resolve its own sibling assets from there:
#   ENOENT: /app/node_modules/.bin/prisma_schema_build_bg.wasm
# The entrypoint invokes build/index.js directly instead.
COPY --chown=node:node --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --chown=node:node --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Run unprivileged. Everything above is copied as node:node because the prisma
# CLI checks that @prisma/engines is writable before it will run, and refuses
# with "please make sure you install prisma with the right permissions" against
# root-owned files.
USER node

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
