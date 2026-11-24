/** How a reading key moves the document. */
export type ScrollAction = "line-down" | "line-up" | "page-down" | "page-up" | "top" | "bottom";

/** One arrow press, in pixels (about two lines of text). */
const LINE_PX = 48;
/** A page press keeps this much of the previous screen in view, for context. */
const PAGE_OVERLAP = 0.1;

/**
 * Scroll the document showing (the PDF or the markdown reader) as a reading key would.
 * Does nothing while text is being edited, or with no document showing. Returns whether it
 * scrolled.
 */
export function scrollDocument(action: ScrollAction, root: ParentNode = document): boolean {
  const active = document.activeElement;
  if (active instanceof HTMLElement && (active.isContentEditable || active.closest("input, textarea, select"))) {
    return false;
  }
  const scroller = root.querySelector<HTMLElement>(".pdf-reader__scroll, .reader-scroll");
  if (!scroller) return false;
  const page = scroller.clientHeight * (1 - PAGE_OVERLAP);
  switch (action) {
    case "line-down":
      scroller.scrollTop += LINE_PX;
      break;
    case "line-up":
      scroller.scrollTop -= LINE_PX;
      break;
    case "page-down":
      scroller.scrollTop += page;
      break;
    case "page-up":
      scroller.scrollTop -= page;
      break;
    case "top":
      scroller.scrollTop = 0;
      break;
    case "bottom":
      scroller.scrollTop = scroller.scrollHeight;
      break;
  }
  return true;
}
