# Debian, not Alpine. Alpine is musl, and the lockfile pins
# @tailwindcss/oxide-linux-x64-gnu, the glibc build, added in 690b4b9 to fix
# the Vercel build. On musl that binding cannot load and `next build` dies with
# "Cannot find module @tailwindcss/oxide-linux-x64-musl".
#
# Prisma has the same split: on Alpine it fails to detect libssl and falls back
# to an openssl-1.1.x engine that does not match the system.
#
# Stage 1: dependencies
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# ci, not install: the lockfile is the point of shipping one.
RUN npm ci

# Stage 2: build
FROM node:20-bookworm-slim AS builder
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
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Prisma's query engine links against OpenSSL. bookworm-slim carries libssl3
# but not the ca-certificates that outbound HTTPS to provider APIs needs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Next's standalone output carries its own minimal node_modules and a copy of
# the resolved config, so next.config.ts is deliberately not copied here.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# The entrypoint runs `prisma migrate deploy` on boot. Copying the CLI from the
# builder keeps that offline and pinned to the lockfile; without it, npx would
# fetch a floating version from the network on every container start.
#
# node_modules/.bin/prisma is deliberately not copied. It is a symlink to
# ../prisma/build/index.js, and COPY dereferences symlinks, so it would land as
# a real file inside .bin/ and then resolve its own sibling assets from there:
#   ENOENT: /app/node_modules/.bin/prisma_schema_build_bg.wasm
# The entrypoint invokes build/index.js directly instead.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Run unprivileged. The standalone image needs no write access to its own files.
USER node

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
