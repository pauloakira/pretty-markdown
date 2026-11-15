import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachRetile } from "./retile";

/** A scroller with a width, as on screen (jsdom lays nothing out). */
function scroller() {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: 1366 });
  document.body.append(el);
  return el;
}

function setTouchPoints(n: number) {
  Object.defineProperty(navigator, "maxTouchPoints", { value: n, configurable: true });
}

describe("attachRetile", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // One animation frame = 16 ms of fake time.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 16));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setTouchPoints(0);
  });

  it("does nothing without a touch screen", () => {
    setTouchPoints(0);
    const el = scroller();
    const changes: boolean[] = [];
    attachRetile(el, { onRetiling: (on) => changes.push(on) });
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual([]);
  });

  it("narrows the scroller for one frame when it appears, twice", () => {
    setTouchPoints(5);
    const el = scroller();
    const changes: boolean[] = [];
    attachRetile(el, { onRetiling: (on) => changes.push(on) });

    vi.advanceTimersByTime(250);
    expect(el.style.marginRight).toBe("1px");
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(16);
    expect(el.style.marginRight).toBe("");
    vi.advanceTimersByTime(16);
    expect(changes).toEqual([true, false]);

    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true, false, true, false]);
  });

  it("does it again when the page becomes visible, and stops when detached", () => {
    setTouchPoints(5);
    const el = scroller();
    const changes: boolean[] = [];
    const detach = attachRetile(el, { onRetiling: (on) => changes.push(on) });
    vi.advanceTimersByTime(2000);
    changes.length = 0;

    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual([true, false, true, false]);

    changes.length = 0;
    detach();
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual([]);
    expect(el.style.marginRight).toBe("");
  });
});
