import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

/**
 * Opens files handed to the app by the OS (double-click a `.md`, or `open` while running).
 * Handles both paths: an event for files opened while running, and a drained queue for
 * files passed at launch before this listener was ready. `onOpen` should be stable.
 */
export function useFileOpen(onOpen: (path: string) => void): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      // Listen first so nothing slips through between draining and subscribing.
      const un = await listen<string[]>("open-files", (event) => {
        for (const path of event.payload) onOpen(path);
      });
      if (disposed) {
        un();
        return;
      }
      unlisten = un;

      try {
        const pending = await invoke<string[]>("take_pending_files");
        for (const path of pending) onOpen(path);
      } catch {
        // not running under Tauri (e.g. plain `vite`) — ignore
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onOpen]);
}
