import { describe, it, expect } from 'vitest';
import { generatePassword, GENERATED_LENGTH, GENERATED_MEETS_MINIMUM } from '@/lib/generate-password';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-rules';

/**
 * The generated first password.
 *
 * The rules that matter are that it passes the server's own check, that it can
 * be typed out of a chat message without ambiguity, and that the mapping from
 * random bytes to characters is even.
 */

function bytes(values: number[]): (count: number) => Uint8Array {
  return (count) => Uint8Array.from({ length: count }, (_, index) => values[index % values.length]);
}

describe('generating a first password', () => {
  it('is three groups of six', () => {
    expect(generatePassword(bytes([0]))).toMatch(/^[a-z2-9]{6}-[a-z2-9]{6}-[a-z2-9]{6}$/);
  });

  it('clears the length the server enforces', () => {
    expect(GENERATED_LENGTH).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
    expect(GENERATED_MEETS_MINIMUM).toBe(true);
    expect(generatePassword(bytes([7])).replace(/-/g, '')).toHaveLength(GENERATED_LENGTH);
  });

  // l and 1, o and 0 are the pairs that turn a handover into a support message.
  it('leaves out the characters that get misread', () => {
    const everyByte = Array.from({ length: 256 }, (_, index) => index);
    const produced = new Set(generatePassword(bytes(everyByte)).replace(/-/g, ''));
    for (const char of ['l', 'o', '0', '1']) expect(produced.has(char)).toBe(false);
  });

  // 256 is a multiple of the alphabet, so no character is likelier than another.
  it('maps bytes to characters evenly', () => {
    const counts = new Map<string, number>();
    for (let value = 0; value < 256; value += 1) {
      // Every byte the same, so one run of the generator weighs one byte value.
      const char = generatePassword(bytes([value]))[0];
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(counts.size).toBe(32);
    expect(new Set(counts.values())).toEqual(new Set([8]));
  });

  it('uses each random byte once', () => {
    const first = generatePassword(bytes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]));
    expect(first).toBe('abcdef-ghijkm-npqrst');
  });

  it('does not repeat itself with real randomness', () => {
    const drawn = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(drawn.size).toBe(50);
  });
});
