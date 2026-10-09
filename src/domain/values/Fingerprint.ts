/**
 * A cheap fingerprint of a file's bytes: its length plus a 32-bit FNV-1a hash. Used to
 * recognise a file the app wrote itself when a change notification comes back, without
 * keeping a copy of the bytes. Not cryptographic; the length makes accidental matches
 * between different versions of the same file vanishingly unlikely.
 */
export function fingerprint(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return `${bytes.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
