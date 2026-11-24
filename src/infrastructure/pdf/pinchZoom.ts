/*
 * Pinch to zoom a PDF (ipad/PLAN.md, Phase D). The page grows or shrinks under the
 * fingers, anchored where they are, and follows them as they move; it's redrawn sharp
 * once they lift. Ending near the fit-width scale snaps back to "Fit width"
 * (`pinchedPdfZoom`).
 *
 * WebKit's own pinch would zoom the whole app (toolbar and all) and blur it, so it's
 * turned off over the pages (CSS `touch-action: pan-x pan-y` on the scroller, and the
 * gesture events are cancelled) and done here instead:
 *
 * - Touch screens (iPad): two-finger touch events, as pdf.js's own viewer does. The
 *   two-finger touchmoves are cancelled, which also stops native scrolling during the
 *   pinch, so the pinch pans by the fingers' midpoint itself (unless `pans()` says
 *   something else pans two fingers already, as highlight mode does).
 * - Mac trackpads: WebKit's gesture events (`gesturechange` carries the scale), and
 *   ctrl+wheel, which is how other engines (and some WebKit builds) report a pinch.
 */
import { clampPdfScale } from "../../domain/values/ViewState";

export interface PinchZoomOptions {
  /** The scale in effect now. */
  scale(): number;
  /**
   * Show the pages at `scale`, keeping the point `origin` (client px) where it is, and
   * pan by `pan` (px, the fingers' movement). Called at most once per frame.
   */
  zoomTo(scale: number, origin: readonly [number, number], pan: readonly [number, number]): void;
  /** The pinch ended (redraw sharp, snap, record the zoom). */
  end(): void;
  /** Whether the pinch should pan by the fingers' movement too. */
  pans(): boolean;
}

/** WebKit's GestureEvent (not in TypeScript's DOM types). */
interface GestureEventLike extends UIEvent {
  readonly scale: number;
  readonly clientX: number;
  readonly clientY: number;
}

/** A ctrl+wheel pinch counts as finished after this long without another wheel event. */
const WHEEL_END_MS = 200;
/** Wheel delta (px) per e-fold of zoom: a trackpad pinch sends small deltas. */
const WHEEL_ZOOM_SPEED = 100;

export function attachPinchZoom(container: HTMLElement, options: PinchZoomOptions): () => void {
  const touchScreen = navigator.maxTouchPoints > 0;

  // ---- One pinch, from any source ----------------------------------------------------
  let startScale = 0;
  let pending: { scale: number; origin: [number, number]; pan: [number, number] } | null = null;
  let frame = 0;

  const flush = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const next = pending;
    pending = null;
    if (next) options.zoomTo(next.scale, next.origin, next.pan);
  };
  const request = (scale: number, origin: [number, number], pan: [number, number] = [0, 0]) => {
    const target = clampPdfScale(scale);
    pending = pending
      ? { scale: target, origin, pan: [pending.pan[0] + pan[0], pending.pan[1] + pan[1]] }
      : { scale: target, origin, pan };
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const finish = () => {
    flush();
    startScale = 0;
    options.end();
  };

  // ---- Touch screens: two fingers -----------------------------------------------------
  let touchStart: { distance: number; mid: [number, number] } | null = null;
  const fingers = (event: TouchEvent) => {
    const [a, b] = [event.touches[0], event.touches[1]];
    return {
      distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      mid: [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2] as [number, number],
    };
  };
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 2) {
      if (touchStart) {
        touchStart = null;
        finish(); // a third finger: stop where it is
      }
      return;
    }
    const now = fingers(event);
    if (now.distance < 1) return;
    touchStart = now;
    startScale = options.scale();
  };
  const onTouchMove = (event: TouchEvent) => {
    if (!touchStart || event.touches.length !== 2) return;
    event.preventDefault(); // no native zoom or scroll: the pinch pans and zooms itself
    const now = fingers(event);
    const pan: [number, number] = options.pans()
      ? [now.mid[0] - touchStart.mid[0], now.mid[1] - touchStart.mid[1]]
      : [0, 0];
    touchStart = { distance: touchStart.distance, mid: now.mid };
    request((startScale * now.distance) / touchStart.distance, now.mid, pan);
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (!touchStart || event.touches.length >= 2) return;
    touchStart = null;
    finish();
  };

  // ---- Gesture events: WebKit's pinch --------------------------------------------------
  // On a touch screen they come along with the touches above; they're only cancelled
  // there (or WebKit zooms the page). On the Mac they're the trackpad's pinch.
  let gesturing = false;
  const onGestureStart = (event: Event) => {
    event.preventDefault();
    if (touchScreen) return;
    gesturing = true;
    startScale = options.scale();
  };
  const onGestureChange = (event: Event) => {
    event.preventDefault();
    if (touchScreen || !gesturing) return;
    const gesture = event as GestureEventLike;
    request(startScale * gesture.scale, [gesture.clientX, gesture.clientY]);
  };
  const onGestureEnd = (event: Event) => {
    event.preventDefault();
    if (touchScreen || !gesturing) return;
    gesturing = false;
    finish();
  };

  // ---- ctrl+wheel: a trackpad pinch elsewhere -------------------------------------------
  let wheelScale = 0;
  let wheelTimer = 0;
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey || gesturing) return;
    event.preventDefault();
    if (!wheelTimer) {
      startScale = options.scale();
      wheelScale = startScale;
    }
    window.clearTimeout(wheelTimer);
    const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
    wheelScale = clampPdfScale(wheelScale * Math.exp(-delta / WHEEL_ZOOM_SPEED));
    request(wheelScale, [event.clientX, event.clientY]);
    wheelTimer = window.setTimeout(() => {
      wheelTimer = 0;
      finish();
    }, WHEEL_END_MS);
  };

  const active = { passive: false } as const;
  container.addEventListener("touchstart", onTouchStart, { passive: true });
  container.addEventListener("touchmove", onTouchMove, active);
  container.addEventListener("touchend", onTouchEnd, { passive: true });
  container.addEventListener("touchcancel", onTouchEnd, { passive: true });
  container.addEventListener("gesturestart", onGestureStart, active);
  container.addEventListener("gesturechange", onGestureChange, active);
  container.addEventListener("gestureend", onGestureEnd, active);
  container.addEventListener("wheel", onWheel, active);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.clearTimeout(wheelTimer);
    container.removeEventListener("touchstart", onTouchStart);
    container.removeEventListener("touchmove", onTouchMove);
    container.removeEventListener("touchend", onTouchEnd);
    container.removeEventListener("touchcancel", onTouchEnd);
    container.removeEventListener("gesturestart", onGestureStart);
    container.removeEventListener("gesturechange", onGestureChange);
    container.removeEventListener("gestureend", onGestureEnd);
    container.removeEventListener("wheel", onWheel);
  };
}
