import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

/** Space kept between the active tab and the strip's edge when scrolling it into view. */
const REVEAL_MARGIN = 32;

interface StripOverflow {
  /** There are tabs scrolled out of view on the left / right. */
  start: boolean;
  end: boolean;
}

/**
 * Behavior for the horizontally-scrolling tab strip, whose scrollbar is hidden:
 * - a vertical mouse wheel scrolls it sideways (trackpads already scroll horizontally);
 * - the active tab is scrolled into view whenever it changes (or the tabs do);
 * - reports which edges have hidden tabs, so they can be faded.
 *
 * `layoutKey` should change whenever the strip's contents may have changed size
 * (e.g. the workspace snapshot).
 */
export function useTabStrip(
  listRef: RefObject<HTMLElement | null>,
  activeTabId: string | null,
  layoutKey: unknown,
): StripOverflow {
  const [overflow, setOverflow] = useState<StripOverflow>({ start: false, end: false });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const max = list.scrollWidth - list.clientWidth;
      const start = list.scrollLeft > 1;
      const end = list.scrollLeft < max - 1;
      setOverflow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    const onWheel = (e: WheelEvent) => {
      if (list.scrollWidth <= list.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already horizontal
      e.preventDefault();
      list.scrollLeft += e.deltaY;
    };

    measure();
    list.addEventListener("scroll", measure, { passive: true });
    list.addEventListener("wheel", onWheel, { passive: false });
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => {
      list.removeEventListener("scroll", measure);
      list.removeEventListener("wheel", onWheel);
      observer.disconnect();
    };
  }, [listRef]);

  // Keep the active tab visible. Manual scrollLeft math rather than scrollIntoView, which
  // doesn't reliably move nested overflow containers in WKWebView.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || activeTabId === null) return;
    const tab = list.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeTabId)}"]`);
    if (tab) {
      const strip = list.getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      if (r.left < strip.left + REVEAL_MARGIN) {
        list.scrollLeft -= strip.left + REVEAL_MARGIN - r.left;
      } else if (r.right > strip.right - REVEAL_MARGIN) {
        list.scrollLeft += r.right - (strip.right - REVEAL_MARGIN);
      }
    }
    // Contents changed size: re-check the fades even if nothing scrolled.
    const max = list.scrollWidth - list.clientWidth;
    const start = list.scrollLeft > 1;
    const end = list.scrollLeft < max - 1;
    setOverflow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [listRef, activeTabId, layoutKey]);

  return overflow;
}
