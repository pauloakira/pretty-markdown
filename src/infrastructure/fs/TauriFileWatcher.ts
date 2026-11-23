import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FileWatcher } from "../../domain/ports/FileWatcher";

/**
 * Watches files through the Rust core: `watch_file` / `unwatch_file`, and the
 * `file-changed` event with the paths that changed. The core watches each path once, so
 * this counts the watchers of each path and asks it to stop only when the last one ends.
 * On iPadOS the commands fail (there's nothing to watch with), which is ignored.
 */
export class TauriFileWatcher implements FileWatcher {
  private readonly watchers = new Map<string, Set<() => void>>();
  private listening: Promise<void> | null = null;

  watch(path: string, onChange: () => void): () => void {
    this.listen();
    let watchers = this.watchers.get(path);
    if (!watchers) {
      watchers = new Set();
      this.watchers.set(path, watchers);
      void invoke("watch_file", { path }).catch(() => {});
    }
    // Each watch is its own entry, even with the same function.
    const entry = () => onChange();
    watchers.add(entry);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      const current = this.watchers.get(path);
      if (!current) return;
      current.delete(entry);
      if (current.size === 0) {
        this.watchers.delete(path);
        void invoke("unwatch_file", { path }).catch(() => {});
      }
    };
  }

  /** Listen for `file-changed` once, for the app's lifetime. */
  private listen() {
    this.listening ??= listen<string[]>("file-changed", (event) => {
      for (const path of event.payload) {
        for (const onChange of [...(this.watchers.get(path) ?? [])]) onChange();
      }
    }).then(
      () => {},
      () => {},
    );
  }
}
