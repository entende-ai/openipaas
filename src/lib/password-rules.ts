/**
 * The one password rule, in a module with no Node imports.
 *
 * password.ts pulls in node:crypto, so a client component that only needs the
 * minimum length would drag it into the browser bundle and break the build.
 */

/**
 * Short enough to type, long enough that scrypt plus a vague error message
 * makes online guessing pointless. Length is the only rule on purpose:
 * composition rules push people towards Passw0rd! and a sticky note.
 */
export const PASSWORD_MIN_LENGTH = 10;
