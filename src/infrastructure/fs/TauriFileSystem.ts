import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  FilePicker,
  FileReader,
  FileWriter,
} from "../../domain/ports/FileSystem";
import { err, ok, type Result } from "../../domain/values/Result";

/**
 * Tauri-backed implementation of the file ports. Reading/writing go through native
 * commands (see src-tauri/src/lib.rs); dialogs use the dialog plugin.
 */
export class TauriFileSystem implements FilePicker, FileReader, FileWriter {
  async pickDocument(): Promise<string | null> {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Documents", extensions: ["md", "markdown", "mdown", "txt", "pdf"] },
        { name: "Markdown", extensions: ["md", "markdown", "mdown", "txt"] },
        { name: "PDF", extensions: ["pdf"] },
      ],
    });
    return typeof selected === "string" ? selected : null;
  }

  async pickSavePath(defaultName?: string): Promise<string | null> {
    const selected = await save({
      defaultPath: defaultName,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    return selected ?? null;
  }

  async readTextFile(path: string): Promise<Result<string>> {
    try {
      const content = await invoke<string>("read_text_file", { path });
      return ok(content);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async readBytes(path: string, maxBytes?: number): Promise<Result<Uint8Array>> {
    try {
      // The command returns a raw IPC response, which arrives as an ArrayBuffer (no JSON).
      const buffer = await invoke<ArrayBuffer>("read_file_bytes", { path, maxBytes });
      return ok(new Uint8Array(buffer));
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async writeTextFile(path: string, contents: string): Promise<Result<void>> {
    try {
      await invoke("write_text_file", { path, contents });
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<Result<void>> {
    try {
      // The bytes go as the raw request body (no JSON), and the path in a header, which
      // must be ASCII: hence the percent-encoding (decoded by the command).
      await invoke("write_file_bytes", bytes, { headers: { path: encodeURIComponent(path) } });
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }
}
