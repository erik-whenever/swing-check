// The native adapter for the per-installation identity (W-2, docs/native/identitet-w2.md).
// Format and validation live in @swingcheck/core/lib/installId; this file only reads and
// writes the Keychain (iOS) / Keystore-backed storage (Android) and supplies randomness.

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { INSTALL_ID_STORAGE_KEY, resolveInstallId } from '@swingcheck/core/lib/installId';

// THIS_DEVICE_ONLY: the entry is never migrated to another device through a backup restore,
// so a restored or second phone gets an identity of its own — "per installation".
// AFTER_FIRST_UNLOCK: readable in the background after the first unlock since boot.
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * Read the installation's identity, creating and storing it on first launch.
 *
 * Synchronous on purpose: coreSetup runs before anything renders, so the header is in
 * place before the first analysis can start — no race with an async Keychain read.
 *
 * Returns null if secure storage fails. The app then sends no identity header and keeps
 * working locally; the Worker counts such calls in its shared anonymous bucket.
 */
// OSÄKER: iOS keeps Keychain items after the app is deleted, so a reinstall on the same
// phone usually keeps its identity (Android does not). Harmless for the cap — it only
// means "installation" is closer to "device" on iOS. Unverified on device.
export function loadInstallId(): string | null {
  try {
    const stored = SecureStore.getItem(INSTALL_ID_STORAGE_KEY, STORE_OPTIONS);
    const { id, created } = resolveInstallId(stored, Crypto.getRandomBytes);
    if (created) SecureStore.setItem(INSTALL_ID_STORAGE_KEY, id, STORE_OPTIONS);
    return id;
  } catch (err) {
    console.warn('[installId] secure storage unavailable — no identity header', String(err));
    return null;
  }
}
