// expo-file-system implementation of TextStore (N-3.6). The JSON files live in the app's
// document directory under `state/`, which iOS backs up and the user cannot see or edit.

import { Directory, File, Paths } from 'expo-file-system';
import type { TextStore } from './storage';

export const STATE_DIR = 'state';

function stateDir(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function createFileStore(dirName: string = STATE_DIR): TextStore {
  return {
    async read(name) {
      const file = new File(stateDir(dirName), name);
      if (!file.exists) return null;
      return file.text();
    },
    async write(name, text) {
      const dir = stateDir(dirName);
      // Write beside the target, then move over it: a crash mid-write leaves the old file
      // whole instead of a truncated one that would load as an empty history.
      // OSÄKER: that move({ overwrite: true }) is an atomic replace on iOS/Android is the
      // expected native behaviour (rename within one directory) but unverified on device.
      // Risk: low — worst case is the pre-existing truncation risk, and history.json is
      // backed up before any unreadable file is overwritten (appStore).
      const tmp = new File(dir, `${name}.tmp`);
      tmp.create({ overwrite: true });
      await tmp.write(text);
      await tmp.move(new File(dir, name), { overwrite: true });
    },
  };
}
