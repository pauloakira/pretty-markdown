import type { ScreenBox, SelectedPassage, SelectionPlace } from "../../presentation/pdf/PdfViewer";
import { snapSelectionToWords } from "./wordSnap";

/** Quiet period after a keyboard selection change before it's reported. */
const SETTLE_MS = 120;

interface SelectionWatchOptions {
  /** The text selected in the document now, or null. */
  readonly read: () => SelectedPassage | null;
  /** Whether selections are offered actions now (not in highlight mode, say). */
  readonly isActive: () => boolean;
  readonly onChange: (selection: SelectionPlace | null) => void;
}

/**
 * Reports a text selection in `container` once the reader has made it, and where it is on
 * screen, for the selection popover: when the pointer is released after selecting (a drag,
 * a double or triple click), after a keyboard change settles, and again as the pages
 * scroll or zoom. While the pointer is down nothing is offered (a selection is still being
 * made), and null is reported once the selection is gone.
 */
export function attachSelectionWatch(
  container: HTMLElement,
  options: SelectionWatchOptions,
): { refresh: () => void; detach: () => void } {
  let pressing = false;
  let shown = false;
  let timer = 0;
  let frame = 0;

  const report = () => {
    window.clearTimeout(timer);
    const passage = options.isActive() ? options.read() : null;
    const bounds = passage ? selectionBounds() : null;
    if (passage && bounds) {
      shown = true;
      options.onChange({ passage, bounds });
    } else if (shown) {
      shown = false;
      options.onChange(null);
    }
  };

  const onPress = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pressing = true;
    if (shown) {
      shown = false;
      options.onChange(null);
    }
  };
  const onRelease = () => {
    if (!pressing) return;
    pressing = false;
    // After the browser has settled the selection (a click that only deselects, too). A
    // dragged selection takes whole words: the quote and highlight shouldn't stop mid-word.
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (options.isActive() && options.read()) snapSelectionToWords(document.getSelection());
      report();
    }, 0);
  };
  const onSelectionChange = () => {
    if (pressing) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(report, SETTLE_MS);
  };
  const onScroll = () => {
    if (!shown || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      report();
    });
  };

  container.addEventListener("pointerdown", onPress);
  window.addEventListener("pointerup", onRelease);
  window.addEventListener("pointercancel", onRelease);
  document.addEventListener("selectionchange", onSelectionChange);
  container.addEventListener("scroll", onScroll, { passive: true });

  return {
    refresh: report,
    detach() {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      container.removeEventListener("pointerdown", onPress);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      document.removeEventListener("selectionchange", onSelectionChange);
      container.removeEventListener("scroll", onScroll);
    },
  };
}

/** The selection's bounding box on screen, or null if it has none (nothing laid out). */
function selectionBounds(): ScreenBox | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  // Line boxes, not the range's own box: a selection ending at the start of a line would
  // otherwise reach down to a line it doesn't show on.
  const rects = [...selection.getRangeAt(0).getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  if (rects.length === 0) return null;
  return {
    left: Math.min(...rects.map((r) => r.left)),
    top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  };
}
