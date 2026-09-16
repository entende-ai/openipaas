import { describe, it, expect } from 'vitest';
import {
  SANDBOX_MARKER,
  isSandboxRecord,
  sandboxCompany,
  sandboxContact,
  sandboxDeal,
} from '@/lib/sandbox/crm-fixtures';
import { assign, parseArgs, MAX_PER_RESOURCE, SEED_DEFAULTS } from '@/lib/sandbox/crm-seed-options';

/**
 * The seed script writes to a real CRM account, so the guard rails are what
 * these tests are about: nothing is written by accident, and everything written
 * can be found again.
 */

const CREDENTIALS = ['--api-key', 'key_123', '--account-token', 'acct_456'];

describe('seed arguments', () => {
  it('requires both credentials', () => {
    expect(() => parseArgs(['--account-token', 'acct_456'])).toThrow(/--api-key is required/);
    expect(() => parseArgs(['--api-key', 'key_123'])).toThrow(/--account-token is required/);
  });

  it('is a dry run unless --confirm is passed', () => {
    expect(parseArgs(CREDENTIALS).confirm).toBe(false);
    expect(parseArgs([...CREDENTIALS, '--confirm']).confirm).toBe(true);
  });

  it('falls back to the documented defaults', () => {
    const options = parseArgs(CREDENTIALS);

    expect(options.baseUrl).toBe(SEED_DEFAULTS.baseUrl);
    expect(options.companies).toBe(SEED_DEFAULTS.companies);
    expect(options.contacts).toBe(SEED_DEFAULTS.contacts);
    expect(options.deals).toBe(SEED_DEFAULTS.deals);
  });

  it('caps how much a single run can write', () => {
    expect(parseArgs([...CREDENTIALS, '--contacts', String(MAX_PER_RESOURCE)]).contacts).toBe(MAX_PER_RESOURCE);
    expect(() => parseArgs([...CREDENTIALS, '--contacts', String(MAX_PER_RESOURCE + 1)])).toThrow(/capped/);
    expect(() => parseArgs([...CREDENTIALS, '--deals', '-3'])).toThrow(/whole number/);
    expect(() => parseArgs([...CREDENTIALS, '--companies', '2.5'])).toThrow(/whole number/);
  });

  it('refuses a flag whose value is missing rather than swallowing the next flag', () => {
    // Without this, `--api-key --confirm` would send "--confirm" as the key.
    expect(() => parseArgs(['--api-key', '--confirm'])).toThrow(/--api-key needs a value/);
    expect(() => parseArgs([...CREDENTIALS, '--base-url'])).toThrow(/--base-url needs a value/);
    expect(() => parseArgs(['seed', ...CREDENTIALS])).toThrow(/Unexpected argument/);
  });

  it('strips a trailing slash from the base url', () => {
    // Paths are appended directly, so the slash would double up in every call.
    expect(parseArgs([...CREDENTIALS, '--base-url', 'http://localhost:3100/']).baseUrl).toBe('http://localhost:3100');
  });
});

describe('sandbox fixtures', () => {
  it('marks every record so it can be found and deleted', () => {
    const records = [
      sandboxCompany(3).name,
      sandboxContact(3, null).name,
      sandboxDeal(3, { companyId: null, contactId: null, stageId: null }).name,
    ];

    for (const name of records) {
      expect(name).toContain(SANDBOX_MARKER);
      expect(isSandboxRecord(name)).toBe(true);
    }
    expect(isSandboxRecord('Padaria Sao Jorge')).toBe(false);
  });

  it('never repeats a name, however many records are asked for', () => {
    const names = Array.from({ length: MAX_PER_RESOURCE }, (_, i) => sandboxContact(i, null).name);
    expect(new Set(names).size).toBe(MAX_PER_RESOURCE);

    const emails = Array.from({ length: MAX_PER_RESOURCE }, (_, i) => sandboxContact(i, null).email);
    expect(new Set(emails).size).toBe(MAX_PER_RESOURCE);
  });

  it('writes only fields the unified create accepts', () => {
    const deal = sandboxDeal(0, { companyId: 'org_1', contactId: 'con_1', stageId: 'stage_1' });

    expect(deal.stageId).toBe('stage_1');
    expect(deal.contactIds).toEqual(['con_1']);
    // pipeline_id is read only upstream, so the fixture must not carry one.
    expect(deal.pipelineId).toBeUndefined();
    expect(typeof deal.amount).toBe('number');
  });

  it('leaves references null when there is nothing to point at', () => {
    const contact = sandboxContact(0, null);
    expect(contact.companyId).toBeNull();

    const deal = sandboxDeal(0, { companyId: null, contactId: null, stageId: null });
    expect(deal.companyId).toBeNull();
    expect(deal.contactIds).toEqual([]);
  });

  it('spreads records across the references it was given', () => {
    const companies = [{ id: 'a' }, { id: 'b' }];

    expect(assign(companies, 0)?.id).toBe('a');
    expect(assign(companies, 1)?.id).toBe('b');
    expect(assign(companies, 2)?.id).toBe('a');
    expect(assign([], 0)).toBeNull();
  });
});
