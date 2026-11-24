/**
 * The end of the message the native side gives for a document that isn't there any more
 * (moved, renamed or deleted, or a temporary copy that was cleared away). Keep in step with
 * `MISSING_FILE` in src-tauri/src/lib.rs and `missingFile` in the iPad plugin.
 */
export const MISSING_FILE = "isn't there any more. It may have been moved, renamed or deleted.";

/** Whether a read failed because the file isn't there (rather than, say, no permission). */
export function isMissingFile(message: string): boolean {
  return message.endsWith(MISSING_FILE);
}
