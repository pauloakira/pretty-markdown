import type { Result } from "../values/Result";

/**
 * Port: read and write a document's notes file (docs/RESEARCH_READER.md). Separate from
 * `FileReader`/`FileWriter` because a notes file is often not there yet, and that must be
 * told apart from a file that exists but can't be read: treating an unreadable file as
 * missing would start a new one over the reader's notes.
 */
export interface NotesStore {
  /** The file's text, or null if there is no file at `path` yet. */
  read(path: string): Promise<Result<string | null>>;
  /** Create or overwrite the file at `path`. */
  write(path: string, text: string): Promise<Result<void>>;
}
