import type { Result } from "../values/Result";

/**
 * Port: where the system keeps an app to the files it was given (iPadOS), let the reader
 * allow the folder of a document, so files beside it (its notes) can be made and read.
 */
export interface FolderAccess {
  /**
   * Ask the reader to allow the folder of the document at `documentPath` (they may choose
   * another). Resolves with the folder allowed, or null if they cancelled.
   */
  allowFolderOf(documentPath: string): Promise<Result<string | null>>;
}
