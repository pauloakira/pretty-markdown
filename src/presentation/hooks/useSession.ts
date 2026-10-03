import { useCallback, useEffect, useRef } from "react";
import { useContainer } from "../../composition/ContainerContext";

/** Quiet period after the last workspace change before the session is written. */
const AUTOSAVE_DELAY_MS = 400;

/**
 * Restores the saved tabs on launch (once, into an empty workspace), then autosaves the
 * session as the workspace changes, and exposes persist/clear/quit for the quit prompt.
 *
 * Autosave is what keeps the restored session current: the prompt can't run on every
 * exit path (Dock → Quit, logout, crashes), so it can't be the only place that saves.
 */
export function useSession() {
  const { sessionService, tabManager, appWindow } = useContainer();
  const restoredRef = useRef(false);
  // Autosave stays off until restore settles, or the still-empty startup workspace
  // would overwrite the saved session before it's read back.
  const readyRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return; // run exactly once (survives StrictMode remount)
    restoredRef.current = true;
    void (async () => {
      try {
        const { tabs, activeIndex } = await sessionService.restore();
        // Merge rather than skip if a file opened first (app launched from Finder):
        // skipping used to drop the previous tabs, which autosave would then persist.
        if (tabs.length > 0) tabManager.restore(tabs, activeIndex);
      } finally {
        readyRef.current = true;
        // Prune anything that failed to restore (moved/deleted files) right away.
        void sessionService.autosave(tabManager.getSnapshot());
      }
    })();
  }, [sessionService, tabManager]);

  useEffect(() => {
    let timer = 0;
    const unsubscribe = tabManager.subscribe(() => {
      if (!readyRef.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void sessionService.autosave(tabManager.getSnapshot());
      }, AUTOSAVE_DELAY_MS);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [sessionService, tabManager]);

  const persist = useCallback(
    () => sessionService.persist(tabManager.getSnapshot()),
    [sessionService, tabManager],
  );
  const clear = useCallback(() => sessionService.clear(), [sessionService]);
  const quit = useCallback(() => appWindow.close(), [appWindow]);

  return { persist, clear, quit };
}
