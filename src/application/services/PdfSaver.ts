import type { FileWriter } from "../../domain/ports/FileSystem";
import { fingerprint } from "../../domain/values/Fingerprint";
import type { Result } from "../../domain/values/Result";

/**
 * Writes a PDF's bytes back to its file (e.g. after the reader adds highlights) and
 * remembers what it wrote, so the file watcher can tell our own save from a change made
 * by another app (docs/PDF_HIGHLIGHTS_PLAN.md §4.2). Only a fingerprint is kept, never
 * the bytes.
 */
export class PdfSaver {
  private readonly lastWritten = new Map<string, string>();

  constructor(private readonly writer: FileWriter) {}

  async save(path: string, bytes: Uint8Array): Promise<Result<void>> {
    const result = await this.writer.writeBytes(path, bytes);
    if (result.ok) this.lastWritten.set(path, fingerprint(bytes));
    return result;
  }

  /** Whether `bytes` (just read from `path`) are exactly what we last saved there. */
  isOwnWrite(path: string, bytes: Uint8Array): boolean {
    const written = this.lastWritten.get(path);
    return written !== undefined && written === fingerprint(bytes);
  }

  /** Stop tracking a file, e.g. when its tab closes. */
  forget(path: string): void {
    this.lastWritten.delete(path);
  }
}
