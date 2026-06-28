import type { Result } from "../values/Result";

/** Port: read file contents from disk. */
export interface FileReader {
  readTextFile(path: string): Promise<Result<string>>;
}

/** Port: write file contents to disk. */
export interface FileWriter {
  writeTextFile(path: string, contents: string): Promise<Result<void>>;
}

/** Port: native file dialogs. Each resolves to null if the user cancels. */
export interface FilePicker {
  pickMarkdownFile(): Promise<string | null>;
  pickSavePath(defaultName?: string): Promise<string | null>;
}
