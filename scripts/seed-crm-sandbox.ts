import {
  SANDBOX_MARKER,
  sandboxCompany,
  sandboxContact,
  sandboxDeal,
} from '../src/lib/sandbox/crm-fixtures';
import { assign, parseArgs, USAGE, type SeedOptions } from '../src/lib/sandbox/crm-seed-options';

/**
 * Fills a sandbox CRM account with fake companies, contacts and deals.
 *
 * It calls the unified API over HTTP like any other client, so a successful run
 * is also proof that create works end to end against a real provider. Nothing
 * here imports a provider directly.
 *
 * It writes to whatever account the token points at, so it refuses to write
 * without --confirm and prints the plan first.
 *
 *   npm run seed:crm -- --api-key <key> --account-token <token>
 *   npm run seed:crm -- --api-key <key> --account-token <token> --confirm
 */

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string
  ) {
    super(message);
  }
}

class UnifiedClient {
  constructor(private readonly options: SeedOptions) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.options.baseUrl}/api/unified/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'X-Account-Token': this.options.accountToken,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    if (!response.ok) {
      // The unified error envelope carries a requestId, so keeping the raw body
      // means the user can paste it straight into an issue.
      throw new ApiError(response.status, text, `${method} ${path} failed with ${response.status}`);
    }

    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  get<T>(path: string): Promise<T> {
    return this.call<T>('GET', path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.call<T>('POST', path, body);
  }
}

interface Created {
  id: string;
  name: string;
}

async function createAll(
  client: UnifiedClient,
  label: string,
  path: string,
  payloads: Record<string, unknown>[]
): Promise<Created[]> {
  const created: Created[] = [];

  for (const [index, payload] of payloads.entries()) {
    // Sequential on purpose. The provider rate limit is two requests per second
    // and BaseProvider throttles, so parallel calls would only queue anyway.
    const record = await client.post<Created>(path, payload);
    created.push(record);
    console.log(`  ${index + 1}/${payloads.length} ${label}: ${record.name} (${record.id})`);
  }

  return created;
}

interface PipelineList {
  data?: { name: string; stages: { id: string; name: string }[] }[];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help')) {
    console.log(USAGE);
    return;
  }

  let options: SeedOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`${(error as Error).message}\n`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  console.log(`Target:    ${options.baseUrl}`);
  console.log(`Plan:      ${options.companies} companies, ${options.contacts} contacts, ${options.deals} deals`);
  console.log(`Marker:    ${SANDBOX_MARKER}`);

  if (!options.confirm) {
    console.log('\nDry run. Nothing was written. A sample of what it would create:');
    if (options.companies > 0) console.log(`  company: ${sandboxCompany(0).name}`);
    if (options.contacts > 0) console.log(`  contact: ${sandboxContact(0, null).name}`);
    if (options.deals > 0) {
      console.log(`  deal:    ${sandboxDeal(0, { companyId: null, contactId: null, stageId: null }).name}`);
    }
    console.log('\nRerun with --confirm to write to the account.');
    return;
  }

  const client = new UnifiedClient(options);

  // Deals need a stage. The pipeline itself is read only on the provider side,
  // and a deal with no stage lands nowhere the user can see it.
  let stageId: string | null = null;
  if (options.deals > 0) {
    const pipelines = await client.get<PipelineList>('/pipelines');
    const pipeline = pipelines.data?.find((entry) => entry.stages.length > 0);
    stageId = pipeline?.stages[0]?.id ?? null;

    console.log(
      stageId
        ? `Pipeline:  ${pipeline?.name}, first stage ${pipeline?.stages[0]?.name}`
        : 'Pipeline:  none with stages, deals will be created without one'
    );
  }

  console.log('\nWriting.\n');

  const companies = await createAll(
    client,
    'company',
    '/companies',
    Array.from({ length: options.companies }, (_, i) => sandboxCompany(i) as Record<string, unknown>)
  );

  const contacts = await createAll(
    client,
    'contact',
    '/contacts',
    Array.from(
      { length: options.contacts },
      (_, i) => sandboxContact(i, assign(companies, i)?.id ?? null) as Record<string, unknown>
    )
  );

  const deals = await createAll(
    client,
    'deal',
    '/deals',
    Array.from(
      { length: options.deals },
      (_, i) =>
        sandboxDeal(i, {
          companyId: assign(companies, i)?.id ?? null,
          contactId: assign(contacts, i)?.id ?? null,
          stageId,
        }) as Record<string, unknown>
    )
  );

  console.log(
    `\nDone. ${companies.length} companies, ${contacts.length} contacts, ${deals.length} deals.` +
      `\nSearch for "${SANDBOX_MARKER}" in the CRM to review or delete them.`
  );
}

main().catch((error) => {
  if (error instanceof ApiError) {
    console.error(`\n${error.message}`);
    console.error(error.body.slice(0, 2000));
  } else {
    console.error(`\n${(error as Error).message}`);
  }
  process.exitCode = 1;
});
