/*
 * Text selection by touch on iPad, made to land where the finger is.
 *
 * iPadOS's own selection doesn't line up with pdf.js's text layer (absolutely positioned
 * spans): a long-press on "We" selected "Abstract. W", and dragging a selection handle
 * onto the next line moved the *other* end back to "Abstract", or wouldn't leave the line.
 * The app does get the finger's position (pointer events) during both gestures, so it
 * decides the selection itself, measured with textHit.ts, and puts it back whenever
 * iPadOS applies its own. iPadOS still draws the selection, its handles and its menu.
 */
import { caretAt, wordRangeAt, type TextPoint } from "./textHit";

/** How far a press may move and still be a press (not a scroll). */
const MOVE_TOLERANCE = 10;
/** iPadOS re-applies its own selection just after the finger lifts. */
const SETTLE_MS = 400;
/** How close to a selection end a touch must start to be dragging that end's handle. */
const HANDLE_REACH = 36;

type Gesture =
  | { readonly kind: "press"; readonly x: number; readonly y: number; word?: Range | null }
  | {
      readonly kind: "handle";
      /** The end of the selection that stays put. */
      readonly fixed: TextPoint;
      /** Finger position minus the dragged end's position, kept while dragging. */
      readonly dx: number;
      readonly dy: number;
      wanted: Range | null;
    };

function sameRange(a: Range, b: Range): boolean {
  return (
    a.compareBoundaryPoints(Range.START_TO_START, b) === 0 &&
    a.compareBoundaryPoints(Range.END_TO_END, b) === 0
  );
}

/** The range between two points, in document order. */
function rangeBetween(a: TextPoint, b: TextPoint): Range {
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.collapse(true);
  if (range.comparePoint(b.node, b.offset) < 0) {
    range.setStart(b.node, b.offset);
    range.setEnd(a.node, a.offset);
  } else {
    range.setEnd(b.node, b.offset);
  }
  return range;
}

/** Where a range's start and end are drawn: the left of its first box, the right of its last. */
function ends(range: Range): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
  const boxes = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
  if (boxes.length === 0) return null;
  const first = boxes[0];
  const last = boxes[boxes.length - 1];
  return {
    start: { x: first.left, y: first.top + first.height / 2 },
    end: { x: last.right, y: last.top + last.height / 2 },
  };
}

/** Make touch selection in `container` (a pdf.js viewer's scroller) land on the right text. */
export function attachTouchSelection(container: HTMLElement): () => void {
  let gesture: Gesture | null = null;

  const currentSelection = (): Range | null => {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return container.contains(range.commonAncestorContainer) ? range : null;
  };

  const apply = (range: Range) => {
    const selection = document.getSelection();
    if (!selection) return;
    const current = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (current && sameRange(current, range)) return;
    selection.removeAllRanges();
    selection.addRange(range.cloneRange());
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") {
      gesture = null;
      return;
    }
    // Starting on a handle of the current selection: drag that end, keep the other.
    const selected = currentSelection();
    const drawn = selected ? ends(selected) : null;
    if (selected && drawn) {
      const toStart = Math.hypot(event.clientX - drawn.start.x, event.clientY - drawn.start.y);
      const toEnd = Math.hypot(event.clientX - drawn.end.x, event.clientY - drawn.end.y);
      if (Math.min(toStart, toEnd) <= HANDLE_REACH) {
        const draggingEnd = toEnd <= toStart;
        const moving = draggingEnd ? drawn.end : drawn.start;
        gesture = {
          kind: "handle",
          fixed: draggingEnd
            ? { node: selected.startContainer, offset: selected.startOffset }
            : { node: selected.endContainer, offset: selected.endOffset },
          dx: event.clientX - moving.x,
          dy: event.clientY - moving.y,
          wanted: null,
        };
        return;
      }
    }
    gesture = { kind: "press", x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!gesture) return;
    if (gesture.kind === "press") {
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > MOVE_TOLERANCE) gesture = null;
      return;
    }
    const caret = caretAt(event.clientX - gesture.dx, event.clientY - gesture.dy);
    if (!caret) return;
    const range = rangeBetween(gesture.fixed, caret);
    if (range.collapsed) return;
    gesture.wanted = range;
    apply(range);
  };

  const onPointerUp = () => {
    const ended = gesture;
    window.setTimeout(() => {
      if (gesture === ended) gesture = null;
    }, SETTLE_MS);
  };

  const onSelectionChange = () => {
    if (!gesture || !currentSelection()) return;
    if (gesture.kind === "handle") {
      if (gesture.wanted) apply(gesture.wanted);
      return;
    }
    if (gesture.word === undefined) gesture.word = wordRangeAt(gesture.x, gesture.y);
    if (gesture.word) apply(gesture.word); // not on a word: leave iPadOS's selection alone
  };

  container.addEventListener("pointerdown", onPointerDown, true);
  container.addEventListener("pointermove", onPointerMove, true);
  container.addEventListener("pointerup", onPointerUp, true);
  container.addEventListener("pointercancel", onPointerUp, true);
  document.addEventListener("selectionchange", onSelectionChange);
  return () => {
    container.removeEventListener("pointerdown", onPointerDown, true);
    container.removeEventListener("pointermove", onPointerMove, true);
    container.removeEventListener("pointerup", onPointerUp, true);
    container.removeEventListener("pointercancel", onPointerUp, true);
    document.removeEventListener("selectionchange", onSelectionChange);
  };
}
