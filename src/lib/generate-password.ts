/**
 * A first password an owner can hand over.
 *
 * Owners were left to invent one, which in practice means a weak password
 * reused from somewhere else, so this one is generated in the browser and never
 * travels anywhere it did not already have to go. No Node imports here: the
 * Team page is a client component and password.ts pulls in node:crypto.
 */

import { PASSWORD_MIN_LENGTH } from './password-rules';

/**
 * Lowercase and digits without the pairs that get misread when someone types a
 * password out of a chat message: l and 1, o and 0. Exactly 32 characters, so
 * a byte maps to a character with no bias to correct for.
 */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

const GROUP_SIZE = 6;
const GROUP_COUNT = 3;

/** 18 characters out of a 32-character alphabet, so 90 bits. */
export const GENERATED_LENGTH = GROUP_SIZE * GROUP_COUNT;

function browserBytes(count: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(count));
}

/**
 * Grouped with dashes because the owner reads it aloud or pastes it into a
 * message, and three short blocks survive that better than one long run.
 */
export function generatePassword(randomBytes: (count: number) => Uint8Array = browserBytes): string {
  const bytes = randomBytes(GENERATED_LENGTH);
  const groups: string[] = [];

  for (let group = 0; group < GROUP_COUNT; group += 1) {
    let chars = '';
    for (let index = 0; index < GROUP_SIZE; index += 1) {
      chars += ALPHABET[bytes[group * GROUP_SIZE + index] % ALPHABET.length];
    }
    groups.push(chars);
  }

  return groups.join('-');
}

/** Guards the constants above against an edit that makes them disagree. */
export const GENERATED_MEETS_MINIMUM = GENERATED_LENGTH >= PASSWORD_MIN_LENGTH;
