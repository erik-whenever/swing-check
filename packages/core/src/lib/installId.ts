// Anonymous identity per installation (W-2, docs/native/identitet-w2.md).
//
// The beta has no signed-in account. Each app installation instead creates one random
// identity, keeps it in the platform's secure storage (iOS Keychain via the shell's
// adapter), and sends it to the Worker on every analysis so cost can be capped and
// followed per installation.
//
// This module is pure: the shell supplies the random bytes and the stored value, so the
// format and the validation are testable without a device. It carries no secret — the id
// is an identifier, not a credential, and can be forged by anyone who reads the traffic.

/** Request header the identity travels in. Case-insensitive on the wire. */
export const INSTALL_ID_HEADER = 'X-SwingCheck-Install';

/** Secure-storage key the shell keeps the identity under. */
export const INSTALL_ID_STORAGE_KEY = 'swingcheck.installId';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** True for a lowercase RFC 4122 version-4 UUID — the only format this module issues. */
export function isValidInstallId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

/**
 * Format 16 random bytes as a version-4 UUID (122 random bits). Throws on any other
 * length: a short buffer would silently shrink the id space.
 */
export function formatInstallId(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error(`formatInstallId needs 16 bytes, got ${bytes.length}`);
  }
  const b = Uint8Array.from(bytes);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface ResolvedInstallId {
  id: string;
  /** True when no valid stored id existed and `id` is new — the shell must persist it. */
  created: boolean;
}

/**
 * Keep a valid stored id; otherwise mint a new one. A corrupt or foreign stored value is
 * replaced rather than sent, so the Worker only ever sees the one format.
 */
export function resolveInstallId(
  stored: string | null | undefined,
  randomBytes: (n: number) => Uint8Array,
): ResolvedInstallId {
  if (isValidInstallId(stored)) return { id: stored, created: false };
  return { id: formatInstallId(randomBytes(16)), created: true };
}
