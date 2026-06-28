import type { Result } from "../values/Result";

/** Port: read file contents from disk. */
export interface FileReader {
  readTextFile(path: string): Promise<Result<string>>;
}

/** Port: let the user choose a file (native open dialog). Resolves to null if cancelled. */
export interface FilePicker {
  pickMarkdownFile(): Promise<string | null>;
}
