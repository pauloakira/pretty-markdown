import { useEffect } from "react";
import { useContainer } from "../../composition/ContainerContext";

/**
 * Intercepts the window-close request and calls `onRequest` instead of quitting, so the
 * app can show the "reopen tabs?" prompt. `onRequest` should be stable (useCallback).
 */
export function useQuitGuard(onRequest: () => void): void {
  const { appWindow } = useContainer();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void appWindow.onCloseRequested(onRequest).then((un) => {
      if (disposed) un();
      else unlisten = un;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [appWindow, onRequest]);
}
