import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { TauriFileSystem } from "./TauriFileSystem";

/**
 * A `file://` URL from the iPadOS document picker → the plain path the app uses as the
 * document's identity (so tab names, folder grouping and sessions work as on desktop).
 * Anything that isn't a file URL is returned unchanged.
 */
export function pathFromFileUrl(value: string): string {
  if (!value.startsWith("file://")) return value;
  try {
    return decodeURIComponent(new URL(value).pathname);
  } catch {
    return value;
  }
}

/**
 * The file ports on iOS/iPadOS. Same native commands as desktop for reading and writing
 * (on iOS those go through security-scoped bookmarks and wait for iCloud downloads; see
 * src-tauri/src/lib.rs and ipad/tauri-plugin-ipad-files), but picking differs:
 *
 * - the picker opens files **in place** (`fileAccessMode: "scoped"`) instead of importing
 *   a temporary copy, so edits reach the real file and it can be reopened later;
 * - each picked file is remembered as a bookmark right away, while the app still has
 *   access, so session restore and recent files can reopen it after a relaunch.
 */
export class IosFileSystem extends TauriFileSystem {
  async pickDocument(): Promise<string | null> {
    const selected = await open({
      multiple: false,
      directory: false,
      fileAccessMode: "scoped",
      filters: [{ name: "Documents", extensions: ["md", "markdown", "mdown", "txt", "pdf"] }],
    });
    if (typeof selected !== "string") return null;
    const path = pathFromFileUrl(selected);
    await invoke("remember_document", { path });
    return path;
  }

  /** "Save As" to a new location isn't supported on iPad yet; saving in place works. */
  async pickSavePath(): Promise<string | null> {
    return null;
  }
}
