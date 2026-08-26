import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

import { assertSeedable } from './seed-guard'

const prisma = new PrismaClient()

/**
 * Development fixtures.
 *
 * DESTRUCTIVE: wipes every table before inserting. The docker entrypoint only
 * runs it when RUN_SEED=true, and seed-guard.ts refuses any database that is
 * not demonstrably disposable.
 */

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex')
}

/**
 * Mirrors src/lib/crypto.ts. Duplicated on purpose: the seed runs through tsx
 * without the Next path aliases, and this keeps it dependency-free.
 */
function encrypt(plaintext: string): string {
  const raw = (process.env.CREDENTIALS_ENCRYPTION_KEY || '').trim()
  if (!raw) return plaintext // dev without a key: stored as-is, same as the app

  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes.')

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':')
}

async function main() {
  assertSeedable()

  console.log('🌱 Starting seed...')

  await prisma.webhookDelivery.deleteMany()
  await prisma.webhookEndpoint.deleteMany()
  await prisma.idempotencyKey.deleteMany()
  await prisma.requestLog.deleteMany()
  await prisma.oAuthState.deleteMany()
  await prisma.oAuthCredential.deleteMany()
  await prisma.linkedAccount.deleteMany()
  await prisma.apiKey.deleteMany()
  await prisma.client.deleteMany()

  console.log('🧹 Database cleaned.')

  const devKey = 'oip_live_dev0000000000000000000000000000000000000000'

  const adminClient = await prisma.client.create({
    data: {
      name: 'Admin Local',
      apiKeys: {
        create: {
          keyHash: hashApiKey(devKey),
          keyPrefix: devKey.slice(0, 16),
          name: 'Local development key',
        },
      },
    },
  })

  await prisma.linkedAccount.create({
    data: {
      clientId: adminClient.id,
      provider: 'CONTA_AZUL',
      label: 'Conta Azul',
      accountToken: 'dev-token-ca-123',
      credentials: {
        create: {
          authType: 'OAUTH2',
          accessToken: encrypt('mock-ca-access-token'),
          refreshToken: encrypt('mock-ca-refresh-token'),
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      },
    },
  })

  await prisma.linkedAccount.create({
    data: {
      clientId: adminClient.id,
      provider: 'OMIE',
      label: 'Omie',
      accountToken: 'dev-token-omie-123',
      credentials: {
        create: {
          authType: 'API_KEY',
          accessToken: encrypt('dev-omie-app-key-abc'),
          secrets: encrypt(JSON.stringify({ appKey: 'dev-omie-app-key-abc', appSecret: 'dev-omie-app-secret-xyz' })),
        },
      },
    },
  })

  await prisma.linkedAccount.create({
    data: {
      clientId: adminClient.id,
      provider: 'TINY',
      label: 'Tiny (Olist)',
      accountToken: 'dev-token-tiny-123',
      credentials: {
        create: { authType: 'OAUTH2', accessToken: encrypt('mock-tiny-access-token') },
      },
    },
  })

  console.log('✅ Seed finished successfully!')
  console.log('---')
  console.log(`Master API Key:            ${devKey}`)
  console.log('Conta Azul X-Account-Token: dev-token-ca-123')
  console.log('Omie X-Account-Token:       dev-token-omie-123')
  console.log('Tiny X-Account-Token:       dev-token-tiny-123  (passthrough only)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
