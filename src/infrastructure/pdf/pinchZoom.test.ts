import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachPinchZoom, type PinchZoomOptions } from "./pinchZoom";

type Point = readonly [number, number];

/** A touch event with these fingers down (jsdom has no Touch constructor). */
function touch(type: string, points: readonly Point[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = points.map(([clientX, clientY], identifier) => ({ identifier, clientX, clientY }));
  Object.defineProperty(event, "touches", { value: touches });
  return event;
}

function gesture(type: string, scale: number, at: Point = [100, 200]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    scale: { value: scale },
    clientX: { value: at[0] },
    clientY: { value: at[1] },
  });
  return event;
}

function setup(maxTouchPoints: number, pans = true) {
  Object.defineProperty(navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
  const container = document.createElement("div");
  document.body.append(container);
  let scale = 1;
  const zoomTo = vi.fn<PinchZoomOptions["zoomTo"]>((next) => {
    scale = next;
  });
  const end = vi.fn();
  const detach = attachPinchZoom(container, { scale: () => scale, zoomTo, end, pans: () => pans });
  return { container, zoomTo, end, detach, scale: () => scale };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("pinch to zoom by touch", () => {
  it("zooms by how far the fingers spread, at their midpoint, once per frame", () => {
    const { container, zoomTo, end } = setup(5);
    container.dispatchEvent(touch("touchstart", [[100, 100], [200, 100]]));
    const move = touch("touchmove", [[50, 100], [250, 100]]);
    container.dispatchEvent(move);
    container.dispatchEvent(touch("touchmove", [[25, 100], [275, 100]]));
    expect(move.defaultPrevented).toBe(true); // no native zoom or scroll
    expect(zoomTo).not.toHaveBeenCalled();
    vi.advanceTimersToNextFrame();
    expect(zoomTo).toHaveBeenCalledTimes(1);
    expect(zoomTo).toHaveBeenLastCalledWith(2.5, [150, 100], [0, 0]);
    container.dispatchEvent(touch("touchend", [[25, 100]]));
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("follows the fingers as they move, unless something else pans", () => {
    const { container, zoomTo } = setup(5);
    container.dispatchEvent(touch("touchstart", [[100, 100], [200, 100]]));
    container.dispatchEvent(touch("touchmove", [[100, 130], [200, 130]]));
    vi.advanceTimersToNextFrame();
    expect(zoomTo).toHaveBeenLastCalledWith(1, [150, 130], [0, 30]);

    const still = setup(5, false);
    still.container.dispatchEvent(touch("touchstart", [[100, 100], [200, 100]]));
    still.container.dispatchEvent(touch("touchmove", [[100, 130], [200, 130]]));
    vi.advanceTimersToNextFrame();
    expect(still.zoomTo).toHaveBeenLastCalledWith(1, [150, 130], [0, 0]);
  });

  it("keeps within the zoom range", () => {
    const { container, zoomTo } = setup(5);
    container.dispatchEvent(touch("touchstart", [[100, 100], [110, 100]]));
    container.dispatchEvent(touch("touchmove", [[0, 100], [1000, 100]]));
    vi.advanceTimersToNextFrame();
    expect(zoomTo.mock.lastCall?.[0]).toBe(4);
  });

  it("leaves one finger alone (scrolling, selecting)", () => {
    const { container, zoomTo, end } = setup(5);
    container.dispatchEvent(touch("touchstart", [[100, 100]]));
    const move = touch("touchmove", [[100, 50]]);
    container.dispatchEvent(move);
    container.dispatchEvent(touch("touchend", []));
    vi.advanceTimersToNextFrame();
    expect(move.defaultPrevented).toBe(false);
    expect(zoomTo).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  it("cancels WebKit's own pinch, which would zoom the whole app", () => {
    const { container, zoomTo } = setup(5);
    const start = gesture("gesturestart", 1);
    const change = gesture("gesturechange", 2);
    container.dispatchEvent(start);
    container.dispatchEvent(change);
    vi.advanceTimersToNextFrame();
    expect(start.defaultPrevented && change.defaultPrevented).toBe(true);
    expect(zoomTo).not.toHaveBeenCalled(); // the touches do it
  });

  it("stops listening when detached", () => {
    const { container, zoomTo, detach } = setup(5);
    detach();
    container.dispatchEvent(touch("touchstart", [[100, 100], [200, 100]]));
    container.dispatchEvent(touch("touchmove", [[50, 100], [250, 100]]));
    vi.advanceTimersToNextFrame();
    expect(zoomTo).not.toHaveBeenCalled();
  });
});

describe("pinch to zoom on a Mac trackpad", () => {
  it("zooms by WebKit's gesture scale, where the pointer is", () => {
    const { container, zoomTo, end } = setup(0);
    container.dispatchEvent(gesture("gesturestart", 1));
    container.dispatchEvent(gesture("gesturechange", 1.5, [300, 400]));
    vi.advanceTimersToNextFrame();
    expect(zoomTo).toHaveBeenLastCalledWith(1.5, [300, 400], [0, 0]);
    container.dispatchEvent(gesture("gestureend", 1.5));
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("zooms by ctrl+wheel, and ends a moment after the last one", () => {
    const { container, zoomTo, end } = setup(0);
    const wheel = new WheelEvent("wheel", { deltaY: -50, ctrlKey: true, clientX: 10, clientY: 20, cancelable: true });
    container.dispatchEvent(wheel);
    vi.advanceTimersToNextFrame();
    expect(wheel.defaultPrevented).toBe(true);
    expect(zoomTo.mock.lastCall?.[0]).toBeCloseTo(Math.exp(0.5), 6);
    expect(zoomTo.mock.lastCall?.[1]).toEqual([10, 20]);
    expect(end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("leaves plain scrolling alone", () => {
    const { container, zoomTo } = setup(0);
    const wheel = new WheelEvent("wheel", { deltaY: 80, cancelable: true });
    container.dispatchEvent(wheel);
    vi.advanceTimersToNextFrame();
    expect(wheel.defaultPrevented).toBe(false);
    expect(zoomTo).not.toHaveBeenCalled();
  });
});
