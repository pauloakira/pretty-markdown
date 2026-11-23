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
  /**
   * Where the system places a new file itself, with its contents (iPadOS: the Files "Save
   * to" sheet; an app can't write to a path it wasn't given): save `content` as `name` and
   * resolve to its path, or null if the user cancels. Without it, Save As picks a path and
   * then writes there.
   */
  saveNew?(name: string, content: string): Promise<Result<string | null>>;
}
