# Stage 1: dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# ci, not install: the lockfile is the point of shipping one.
RUN npm ci

# Stage 2: build
FROM node:20-alpine AS builder
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
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Prisma's query engine links against OpenSSL.
RUN apk add --no-cache openssl

# Next's standalone output carries its own minimal node_modules and a copy of
# the resolved config, so next.config.ts is deliberately not copied here.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# The entrypoint runs `prisma migrate deploy` on boot. Copying the CLI from the
# builder keeps that offline and pinned to the lockfile; without it, npx would
# fetch a floating version from the network on every container start.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Run unprivileged. The standalone image needs no write access to its own files.
USER node

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
