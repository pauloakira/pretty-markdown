import { invoke } from "@tauri-apps/api/core";
import type { FolderAccess } from "../../domain/ports/FolderAccess";
import { err, ok, type Result } from "../../domain/values/Result";

/** iPadOS: the Files folder picker, through the `allow_folder` command (src-tauri/src/lib.rs). */
export class TauriFolderAccess implements FolderAccess {
  async allowFolderOf(documentPath: string): Promise<Result<string | null>> {
    try {
      return ok(await invoke<string | null>("allow_folder", { path: documentPath }));
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }
}
