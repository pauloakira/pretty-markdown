/*
 * Highlight mode on touch devices: drag a finger or the Apple Pencil across text and it
 * gets highlighted, like a highlighter pen (docs/PDF_HIGHLIGHTS_PLAN.md §3.4). No
 * long-press, no selection handles. The stroke snaps to whole words and shows a live
 * preview; lifting turns it into a pdf.js highlight.
 *
 * Scrolling takes two fingers meanwhile. Native panning is off in this mode (CSS
 * `touch-action: none` on the scroller; telling WebKit's scroll views to pan with two
 * fingers didn't work), so two-finger panning, with momentum, is done here. Mouse input is
 * left to pdf.js's own highlight mode (select text, release).
 */
import { caretAt, toWordEdge, type TextPoint } from "./textHit";

/** Movement before a press counts as a stroke (a tap on a highlight selects it instead). */
const STROKE_THRESHOLD = 6;
/** How near text a stroke must start (weighted px, see caretAt). */
const START_REACH = 14;
/** Momentum after a two-finger pan: velocity kept per 16 ms frame, and where it stops. */
const MOMENTUM_DECAY = 0.95;
const MOMENTUM_STOP = 0.02; // px/ms
/** The pan's speed at release is measured over this much recent movement, and capped. */
const VELOCITY_WINDOW_MS = 100;
const MAX_VELOCITY = 4; // px/ms

export interface DragHighlightOptions {
  /** Whether highlight mode is on. */
  isActive(): boolean;
  /** The highlighter colour, for the preview. */
  color(): string;
  /** Turn the stroke's text into a highlight. */
  commit(range: Range): void;
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

function pageOf(node: Node): Element | null {
  return node.parentElement?.closest(".page") ?? null;
}

export function attachDragHighlight(container: HTMLElement, options: DragHighlightOptions): () => void {
  // ---- Two-finger panning ----------------------------------------------------------
  const touches = new Map<number, { x: number; y: number }>();
  // Recent midpoints of the pan (time in ms), for its speed when the fingers lift.
  let pan: { x: number; y: number; samples: { t: number; x: number; y: number }[] } | null = null;
  let momentum = 0;
  const midpoint = () => {
    const points = Array.from(touches.values()).slice(0, 2);
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  };
  const stopMomentum = () => {
    cancelAnimationFrame(momentum);
    momentum = 0;
  };
  const glide = (vx: number, vy: number) => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      container.scrollLeft -= vx * dt;
      container.scrollTop -= vy * dt;
      const keep = Math.pow(MOMENTUM_DECAY, dt / 16);
      vx *= keep;
      vy *= keep;
      momentum = Math.hypot(vx, vy) > MOMENTUM_STOP ? requestAnimationFrame(step) : 0;
    };
    momentum = requestAnimationFrame(step);
  };

  let stroke: {
    readonly pointerId: number;
    readonly x: number;
    readonly y: number;
    readonly start: TextPoint;
    started: boolean;
    range: Range | null;
  } | null = null;

  // The preview: translucent boxes over the text the stroke covers so far.
  const preview = document.createElement("div");
  preview.className = "pdf-drag-preview";
  const drawPreview = (range: Range | null) => {
    preview.replaceChildren();
    if (!range) return;
    for (const box of Array.from(range.getClientRects())) {
      if (box.width < 1 || box.height < 1) continue;
      const mark = document.createElement("div");
      mark.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;background:${options.color()}`;
      preview.append(mark);
    }
  };
  const end = () => {
    stroke = null;
    drawPreview(null);
    preview.remove();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" || !options.isActive()) return;
    if (event.pointerType === "touch") {
      stopMomentum();
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2) {
        end(); // a second finger: it's a two-finger scroll, not a stroke
        const { x, y } = midpoint();
        pan = { x, y, samples: [{ t: event.timeStamp, x, y }] };
        event.stopPropagation();
        return;
      }
    }
    const target = event.target as Element | null;
    // Taps on existing highlights and their toolbars belong to pdf.js (select, recolour, delete).
    if (target?.closest(".highlightEditor, .editToolbar")) return;
    const start = caretAt(event.clientX, event.clientY, START_REACH);
    if (!start) return; // not on text (a figure, the margin): leave it to pdf.js
    // Ours from here: keep pdf.js from starting its own selection or freehand stroke.
    event.stopPropagation();
    stroke = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start, started: false, range: null };
    container.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pan && touches.size >= 2) {
      event.stopPropagation();
      const { x, y } = midpoint();
      container.scrollLeft -= x - pan.x;
      container.scrollTop -= y - pan.y;
      const samples = [...pan.samples, { t: event.timeStamp, x, y }].filter(
        (sample) => event.timeStamp - sample.t <= VELOCITY_WINDOW_MS,
      );
      pan = { x, y, samples };
      return;
    }
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    event.stopPropagation();
    if (!stroke.started) {
      if (Math.hypot(event.clientX - stroke.x, event.clientY - stroke.y) < STROKE_THRESHOLD) return;
      stroke.started = true;
      document.body.append(preview);
    }
    const caret = caretAt(event.clientX, event.clientY);
    // One page per stroke: pdf.js highlights live on a page.
    if (!caret || pageOf(caret.node) !== pageOf(stroke.start.node)) return;
    const ordered = rangeBetween(stroke.start, caret);
    const forward = ordered.startContainer === stroke.start.node && ordered.startOffset === stroke.start.offset;
    const from = toWordEdge(forward ? stroke.start : caret, "start");
    const to = toWordEdge(forward ? caret : stroke.start, "end");
    const range = rangeBetween(from, to);
    stroke.range = range.collapsed ? null : range;
    drawPreview(stroke.range);
  };

  const endPan = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    if (!pan || touches.size >= 2) return false;
    const { samples } = pan;
    pan = null;
    // Speed over the recent movement; none if the fingers paused before lifting.
    const first = samples[0];
    const last = samples[samples.length - 1];
    const span = last.t - first.t;
    const recent = event.timeStamp - last.t < VELOCITY_WINDOW_MS / 2;
    if (span >= 20 && recent) {
      const clamp = (v: number) => Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v));
      const vx = clamp((last.x - first.x) / span);
      const vy = clamp((last.y - first.y) / span);
      if (Math.hypot(vx, vy) > MOMENTUM_STOP) glide(vx, vy);
    }
    return true;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (endPan(event)) {
      event.stopPropagation();
      return;
    }
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    event.stopPropagation();
    const range = stroke.started ? stroke.range : null;
    end();
    if (range) options.commit(range);
  };

  const onPointerCancel = (event: PointerEvent) => {
    endPan(event);
    if (stroke && event.pointerId === stroke.pointerId) end();
  };

  container.addEventListener("pointerdown", onPointerDown, true);
  container.addEventListener("pointermove", onPointerMove, true);
  container.addEventListener("pointerup", onPointerUp, true);
  container.addEventListener("pointercancel", onPointerCancel, true);
  return () => {
    end();
    stopMomentum();
    container.removeEventListener("pointerdown", onPointerDown, true);
    container.removeEventListener("pointermove", onPointerMove, true);
    container.removeEventListener("pointerup", onPointerUp, true);
    container.removeEventListener("pointercancel", onPointerCancel, true);
  };
}
