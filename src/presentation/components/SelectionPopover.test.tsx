import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectionPopover } from "./SelectionPopover";

/*
 * The selection popover on its own: where it goes, and keeping the text selection through
 * a tap on it (iPadOS clears the selection as it turns a tap into a click).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let stage: HTMLDivElement;
let text: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  stage = document.createElement("div");
  text = document.createElement("p");
  text.textContent = "Gauss–Legendre nodes are the roots of P_n.";
  stage.append(text);
  document.body.append(stage, host);
  root = createRoot(host);
  const real = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return this === stage ? new DOMRect(0, 40, 1000, 700) : real.call(this);
  });
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function render(props: { below?: boolean; onAddToNotes?: () => void }) {
  const stageRef = createRef<HTMLDivElement>();
  (stageRef as { current: HTMLDivElement | null }).current = stage;
  act(() =>
    root.render(
      <SelectionPopover
        bounds={{ left: 200, top: 300, right: 300, bottom: 320 }}
        stageRef={stageRef}
        canHighlight
        color="yellow"
        onHighlight={() => {}}
        onAddToNotes={props.onAddToNotes ?? (() => {})}
        onCopy={async () => true}
        onDismiss={() => {}}
        below={props.below}
      />,
    ),
  );
  return host.querySelector<HTMLElement>(".selection-popover");
}

const selectWord = () => {
  const range = document.createRange();
  range.setStart(text.firstChild!, 0);
  range.setEnd(text.firstChild!, 5);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
};

describe("SelectionPopover", () => {
  it("goes above the selection on the Mac, and below it on a touch screen, clear of its handle", () => {
    // Above: the selection's top (300) less the gap (8) and the stage's top (40).
    expect(render({})?.style.top).toBe("252px");
    // Below: the selection's bottom (320) plus the touch gap (22), less the stage's top.
    expect(render({ below: true })?.style.top).toBe("302px");
  });

  it("puts back a selection cleared by the tap before the button acts on it", () => {
    let seen = "";
    const popover = render({ onAddToNotes: () => (seen = document.getSelection()!.toString()) });
    selectWord();
    const button = [...popover!.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Add to notes"))!;

    // iPadOS: pointerdown, then the selection goes, then the click.
    act(() => button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    document.getSelection()!.removeAllRanges();
    act(() => button.click());

    expect(seen).toBe("Gauss");
  });

  it("leaves a selection that's still there alone", () => {
    let seen = "";
    const popover = render({ onAddToNotes: () => (seen = document.getSelection()!.toString()) });
    selectWord();
    const button = [...popover!.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Add to notes"))!;
    act(() => button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    act(() => button.click());
    expect(seen).toBe("Gauss");
  });
});
