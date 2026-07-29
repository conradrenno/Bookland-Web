/**
 * UUID shape check for values arriving from the outside — a URL, a form, a link
 * someone edited by hand.
 *
 * The upstream answers `400 INVALID_PARAMETER` to a malformed id, so a page that
 * forwards one blindly turns a typo in the address bar into an error screen
 * instead of an empty result set.
 */

/**
 * Shape only: 8-4-4-4-12 hex. Version and variant nibbles are deliberately *not*
 * pinned — the seeded catalogue uses ids like
 * `a1b2c3d4-e5f6-7890-abcd-ef1234567890`, which are valid identifiers upstream
 * but fail a strict RFC-4122 check. Rejecting them would break the real data.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_SHAPE.test(value);
}
