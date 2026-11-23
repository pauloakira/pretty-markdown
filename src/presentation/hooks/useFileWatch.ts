import { useCallback, useEffect, useRef, useState } from "react";
import { useContainer } from "../../composition/ContainerContext";
import type { Tab, TabId } from "../../domain/entities/Tab";

/** Quiet period after a PDF's last change event before it's checked (see below). */
const PDF_SETTLE_MS = 250;

/**
 * Watches the open files and reacts to external changes:
 * - a clean tab is silently reloaded from disk;
 * - a tab with unsaved edits is flagged as a conflict (its new disk content is kept so the
 *   UI can offer Reload / Keep);
 * - a PDF is shown again from disk (at the same position), unless the change is the app's
 *   own save of its highlights.
 *
 * Our own saves are ignored automatically: the on-disk content then equals the tab's
 * content, so there's nothing to reload.
 */
export function useFileWatch(tabs: readonly Tab[]) {
  const { documentService, fileWatcher, pdfSaver, pdfViewer, tabManager } = useContainer();
  const [conflicts, setConflicts] = useState<Record<TabId, string>>({});
  const disposedRef = useRef(false);
  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

  // What to do when an open file changes on disk.
  const onChangedRef = useRef<(path: string) => void>(() => {});
  const pdfTimers = useRef(new Map<string, number>());
  useEffect(() => {
    const timers = pdfTimers.current;
    // A PDF that changed on disk is shown again, unless the change is our own save (its
    // highlights, written by PdfSaver). A write arrives as a burst of events, possibly
    // while the file is still being written, so check once things have settled.
    const checkPdf = async (path: string) => {
      const data = await documentService.loadPdfData(path);
      if (disposedRef.current || !data.ok) return; // gone or mid-write: a later event follows
      if (pdfSaver.isOwnWrite(path, data.value)) return;
      const tab = tabManager.getSnapshot().tabs.find((t) => t.document.path === path);
      if (tab?.document.kind !== "pdf") return;
      pdfViewer.forget(path); // the kept parsed copy is out of date
      tabManager.reloadPdf(tab.id);
    };
    onChangedRef.current = (path) => {
      void (async () => {
        const tab = tabManager.getSnapshot().tabs.find((t) => t.document.path === path);
        if (!tab) return;
        if (tab.document.kind === "pdf") {
          window.clearTimeout(timers.get(path));
          timers.set(
            path,
            window.setTimeout(() => {
              timers.delete(path);
              void checkPdf(path);
            }, PDF_SETTLE_MS),
          );
          return;
        }
        const outcome = await documentService.load(path);
        if (disposedRef.current) return;
        if (outcome.kind !== "opened" || outcome.document.kind !== "markdown") return;
        const disk = outcome.document.content;
        // Read again: the tab may have changed while the file was read.
        const now = tabManager.getSnapshot().tabs.find((t) => t.id === tab.id);
        if (!now || now.document.kind !== "markdown" || disk === now.document.content) return; // our own save
        if (now.document.content === now.savedContent) {
          tabManager.reloadContent(now.id, disk); // clean → reload silently
        } else {
          setConflicts((prev) => ({ ...prev, [now.id]: disk })); // dirty → let the user choose
        }
      })();
    };
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, [documentService, pdfSaver, pdfViewer, tabManager]);

  // Watch the open tabs' files: one watch per path, kept while a tab has it open.
  const watchesRef = useRef(new Map<string, () => void>());
  useEffect(() => {
    const open = new Set(tabs.map((t) => t.document.path).filter((p): p is string => p !== null));
    const watches = watchesRef.current;
    for (const path of open) {
      if (!watches.has(path)) watches.set(path, fileWatcher.watch(path, () => onChangedRef.current(path)));
    }
    for (const [path, end] of [...watches]) {
      if (!open.has(path)) {
        end();
        watches.delete(path);
      }
    }
  }, [tabs, fileWatcher]);
  useEffect(() => {
    const watches = watchesRef.current;
    return () => {
      for (const end of watches.values()) end();
      watches.clear();
    };
  }, []);

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
