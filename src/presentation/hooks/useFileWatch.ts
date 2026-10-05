import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { useContainer } from "../../composition/ContainerContext";
import type { Tab, TabId } from "../../domain/entities/Tab";

/**
 * Watches the open files and reacts to external changes:
 * - a clean tab is silently reloaded from disk;
 * - a tab with unsaved edits is flagged as a conflict (its new disk content is kept so the
 *   UI can offer Reload / Keep).
 *
 * Our own saves are ignored automatically: the on-disk content then equals the tab's
 * content, so there's nothing to reload.
 */
export function useFileWatch(tabs: readonly Tab[]) {
  const { documentService, tabManager } = useContainer();
  const [conflicts, setConflicts] = useState<Record<TabId, string>>({});
  const watchedRef = useRef<Set<string>>(new Set());

  // Keep the native watch set in sync with the open tabs' paths.
  useEffect(() => {
    const open = new Set(
      tabs.map((t) => t.document.path).filter((p): p is string => p !== null),
    );
    const watched = watchedRef.current;
    for (const path of open) {
      if (!watched.has(path)) {
        watched.add(path);
        void invoke("watch_file", { path }).catch(() => {});
      }
    }
    for (const path of [...watched]) {
      if (!open.has(path)) {
        watched.delete(path);
        void invoke("unwatch_file", { path }).catch(() => {});
      }
    }
  }, [tabs]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      const un = await listen<string[]>("file-changed", async (event) => {
        for (const path of event.payload) {
          const tab = tabManager.getSnapshot().tabs.find((t) => t.document.path === path);
          // PDF tabs aren't reloaded yet (docs/PDF_PLAN.md, Phase 3).
          if (!tab || tab.document.kind !== "markdown") continue;
          const outcome = await documentService.load(path);
          if (outcome.kind !== "opened" || outcome.document.kind !== "markdown") continue;
          const disk = outcome.document.content;
          if (disk === tab.document.content) continue; // no real change / our own save

          if (tab.document.content === tab.savedContent) {
            tabManager.reloadContent(tab.id, disk); // clean → reload silently
          } else {
            setConflicts((prev) => ({ ...prev, [tab.id]: disk })); // dirty → let the user choose
          }
        }
      });
      if (disposed) un();
      else unlisten = un;
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [documentService, tabManager]);

  const reloadConflict = useCallback(
    (id: TabId) => {
      setConflicts((prev) => {
        const disk = prev[id];
        if (disk !== undefined) tabManager.reloadContent(id, disk);
        const { [id]: _dropped, ...rest } = prev;
        return rest;
      });
    },
    [tabManager],
  );

  const dismissConflict = useCallback((id: TabId) => {
    setConflicts((prev) => {
      const { [id]: _dropped, ...rest } = prev;
      return rest;
    });
  }, []);

  return { conflicts, reloadConflict, dismissConflict };
}
