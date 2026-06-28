import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { FilePicker, FileReader } from "../../domain/ports/FileSystem";
import { err, ok, type Result } from "../../domain/values/Result";

/**
 * Tauri-backed implementation of the file ports. Reading goes through the native
 * `read_text_file` command (see src-tauri/src/lib.rs); picking uses the dialog plugin.
 */
export class TauriFileSystem implements FilePicker, FileReader {
  async pickMarkdownFile(): Promise<string | null> {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "txt"] }],
    });
    return typeof selected === "string" ? selected : null;
  }

  async readTextFile(path: string): Promise<Result<string>> {
    try {
      const content = await invoke<string>("read_text_file", { path });
      return ok(content);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }
}
