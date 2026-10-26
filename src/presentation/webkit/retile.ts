/**
 * Make WebKit on iPad redraw a scroller across its full width.
 *
 * Back from another app or the lock screen (iPadOS lays a backgrounded app out at other
 * sizes for its app-switcher snapshots), WebKit could keep drawing only the left 1024 pt
 * of a scroller (an upright iPad's width): the rest stayed black, even while scrolling.
 * Measured on the device: every native view had its full size, but the scroller's last
 * column of tiles was missing. A scroller created after that (opening another PDF)
 * started out the same. A change in the scroller's size makes WebKit recompute its tiles,
 * so this narrows it by one pixel for one frame, when it appears and whenever the page
 * becomes visible again (each twice: iPadOS may restore the window's size a little late).
 *
 * Touch devices only; elsewhere it does nothing.
 */
export interface RetileOptions {
  /** Called with true just before the one-frame resize and false once it's undone, so a
   * resize observer can ignore it. */
  readonly onRetiling?: (retiling: boolean) => void;
}

const DELAYS_MS = [250, 1000];

export function attachRetile(scroller: HTMLElement, options: RetileOptions = {}): () => void {
  if (typeof navigator === "undefined" || navigator.maxTouchPoints === 0) return () => {};

  let frame = 0;
  const timers = new Set<number>();
  const retile = () => {
    if (document.visibilityState !== "visible" || scroller.clientWidth === 0) return;
    cancelAnimationFrame(frame);
    options.onRetiling?.(true);
    scroller.style.marginRight = "1px";
    void scroller.offsetWidth; // lay it out now
    frame = requestAnimationFrame(() => {
      scroller.style.marginRight = "";
      void scroller.offsetWidth;
      frame = requestAnimationFrame(() => options.onRetiling?.(false));
    });
  };
  const schedule = () => {
    for (const delay of DELAYS_MS) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        retile();
      }, delay);
      timers.add(timer);
    }
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") schedule();
  };

  schedule();
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    timers.forEach((timer) => window.clearTimeout(timer));
    cancelAnimationFrame(frame);
    if (scroller.style.marginRight === "1px") scroller.style.marginRight = "";
  };
}
