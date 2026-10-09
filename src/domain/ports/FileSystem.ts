import type { Result } from "../values/Result";

/** Port: read file contents from disk. */
export interface FileReader {
  readTextFile(path: string): Promise<Result<string>>;
  /**
   * Read a file's raw bytes — all of them, or only the first `maxBytes` (e.g. to check a
   * file's signature without reading a large file).
   */
  readBytes(path: string, maxBytes?: number): Promise<Result<Uint8Array>>;
}

/** Port: write file contents to disk. */
export interface FileWriter {
  writeTextFile(path: string, contents: string): Promise<Result<void>>;
  /** Replace a file's contents with raw bytes, e.g. a PDF with new highlights. */
  writeBytes(path: string, bytes: Uint8Array): Promise<Result<void>>;
}

/** Port: native file dialogs. Each resolves to null if the user cancels. */
export interface FilePicker {
  /** Pick a document to open: markdown or PDF. */
  pickDocument(): Promise<string | null>;
  pickSavePath(defaultName?: string): Promise<string | null>;
}
