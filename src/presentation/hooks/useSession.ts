import { useCallback, useEffect, useRef } from "react";
import { useContainer } from "../../composition/ContainerContext";

/**
 * Restores the saved tabs on launch (once, into an empty workspace) and exposes
 * persist/clear/quit for the close flow.
 */
export function useSession() {
  const { sessionService, tabManager, appWindow } = useContainer();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return; // run exactly once (survives StrictMode remount)
    restoredRef.current = true;
    void (async () => {
      const { tabs, activeIndex } = await sessionService.restore();
      // Only populate if nothing has been opened in the meantime.
      if (tabs.length > 0 && tabManager.getSnapshot().tabs.length === 0) {
        tabManager.restore(tabs, activeIndex);
      }
    })();
  }, [sessionService, tabManager]);

  const persist = useCallback(
    () => sessionService.persist(tabManager.getSnapshot()),
    [sessionService, tabManager],
  );
  const clear = useCallback(() => sessionService.clear(), [sessionService]);
  const quit = useCallback(() => appWindow.close(), [appWindow]);

  return { persist, clear, quit };
}
