import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

/**
 * One-off backfill: encrypts credentials written before encryption existed.
 *
 * Rows are identified by the absence of the `v1:` prefix, so the script is
 * idempotent — running it twice re-encrypts nothing.
 *
 *   npx tsx scripts/encrypt-credentials.ts --dry-run
 *   npx tsx scripts/encrypt-credentials.ts
 */

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

function loadKey(): Buffer {
  const raw = (process.env.CREDENTIALS_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not set.');

  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return key;
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

const isPlaintext = (value: string | null): value is string => Boolean(value) && !value!.startsWith('v1:');

async function main() {
  const key = loadKey();
  const credentials = await prisma.oAuthCredential.findMany();

  console.log(`Found ${credentials.length} credential row(s).`);
  if (DRY_RUN) console.log('DRY RUN — nothing will be written.\n');

  let changed = 0;

  for (const credential of credentials) {
    const patch: Record<string, string> = {};

    for (const field of ['accessToken', 'refreshToken', 'erpClientId', 'erpClientSecret', 'secrets'] as const) {
      const value = credential[field];
      if (isPlaintext(value)) patch[field] = encrypt(value, key);
    }

    if (Object.keys(patch).length === 0) continue;
    changed += 1;

    console.log(`  ${credential.id}: encrypting ${Object.keys(patch).join(', ')}`);
    if (!DRY_RUN) {
      await prisma.oAuthCredential.update({ where: { id: credential.id }, data: patch });
    }
  }

  console.log('');
  console.log(
    changed === 0
      ? '✅ Nothing to do — every credential is already encrypted.'
      : `✅ ${DRY_RUN ? 'Would encrypt' : 'Encrypted'} ${changed} credential row(s).`
  );

  const webhooks = await prisma.webhookEndpoint.findMany();
  const plaintextSecrets = webhooks.filter((w) => isPlaintext(w.secret));

  for (const endpoint of plaintextSecrets) {
    console.log(`  webhook ${endpoint.id}: encrypting secret`);
    if (!DRY_RUN) {
      await prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { secret: encrypt(endpoint.secret, key) },
      });
    }
  }
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
