import { invoke } from "@tauri-apps/api/core";
import type { NotesStore } from "../../domain/ports/NotesStore";
import { err, ok, type Result } from "../../domain/values/Result";

/**
 * Notes files through the native file commands (src-tauri/src/lib.rs). Reading uses
 * `read_text_file_if_exists`, which reports a missing file as null and anything else that
 * goes wrong as an error, so a new notes file is only ever started where there was none.
 */
export class TauriNotesStore implements NotesStore {
  async read(path: string): Promise<Result<string | null>> {
    try {
      return ok(await invoke<string | null>("read_text_file_if_exists", { path }));
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async write(path: string, text: string): Promise<Result<void>> {
    try {
      await invoke("write_text_file", { path, contents: text });
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async remove(path: string): Promise<Result<void>> {
    try {
      await invoke("remove_text_file", { path });
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }
}
