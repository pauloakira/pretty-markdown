import type { FileReader, FileWriter } from "../../domain/ports/FileSystem";
import { fingerprint } from "../../domain/values/Fingerprint";
import { err, type Result } from "../../domain/values/Result";

/** Why a save was refused: the file isn't what was opened (or last saved) any more. */
export const CHANGED_ON_DISK =
  "This PDF changed on disk after it was opened, so the highlights weren't saved. Close and reopen it to keep highlighting.";

/**
 * Writes a PDF's bytes back to its file (e.g. after the reader adds highlights), keeping a
 * fingerprint of what's on disk for each open PDF — what was loaded, then what we saved —
 * but never the bytes themselves (docs/PDF_HIGHLIGHTS_PLAN.md §4.2). That lets it:
 *
 * - refuse to save over a file another app changed meanwhile (§5.2), which would
 *   silently throw that change away;
 * - recognise our own saves when the file watcher reports them.
 */
export class PdfSaver {
  private readonly onDisk = new Map<string, string>();
  private readonly finishing = new Map<string, Promise<unknown>>();

  constructor(
    private readonly reader: FileReader,
    private readonly writer: FileWriter,
  ) {}

  /** Record the bytes a PDF was just loaded from. */
  opened(path: string, bytes: Uint8Array): void {
    this.onDisk.set(path, fingerprint(bytes));
  }

  async save(path: string, bytes: Uint8Array): Promise<Result<void>> {
    const expected = this.onDisk.get(path);
    if (expected !== undefined) {
      const current = await this.reader.readBytes(path);
      if (!current.ok) return err(`Couldn't save the highlights: ${current.error}`);
      if (fingerprint(current.value) !== expected) return err(CHANGED_ON_DISK);
    }
    const result = await this.writer.writeBytes(path, bytes);
    if (!result.ok) return err(`Couldn't save the highlights: ${result.error}`);
    this.onDisk.set(path, fingerprint(bytes));
    return result;
  }

  /** Whether `bytes` (just read from `path`) are what we last loaded or saved there. */
  isOwnWrite(path: string, bytes: Uint8Array): boolean {
    const known = this.onDisk.get(path);
    return known !== undefined && known === fingerprint(bytes);
  }

  /**
   * Note a final save still running for `path` (a closed viewer flushing its highlights),
   * so that reopening the file waits for it instead of reading the old content.
   */
  finishLater(path: string, pending: Promise<unknown>): void {
    const done = pending.catch(() => {}).finally(() => {
      if (this.finishing.get(path) === done) this.finishing.delete(path);
    });
    this.finishing.set(path, done);
  }

  /** Resolves once any final save noted for `path` has finished. */
  async settled(path: string): Promise<void> {
    await this.finishing.get(path);
  }

  /** Stop tracking a file, e.g. when its tab closes. */
  forget(path: string): void {
    this.onDisk.delete(path);
  }
}
