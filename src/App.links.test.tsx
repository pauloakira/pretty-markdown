import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMarkdownDocument } from "./domain/entities/Document";
import { launch, makeContainer, settle, shortcut, useAppHarness, type TestContainer } from "./test/appHarness";

/*
 * Link clicks in rendered markdown (reader and edit-mode preview). Unhandled, a click on
 * an http(s) link navigates the app's whole web view away from the UI, so every link
 * click is taken over: in-document links scroll, web/mail links go to the LinkOpener,
 * and nothing else navigates. (`file:` links never get this far: markdown-it doesn't
 * render them as links.)
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const NOTE = "/papers/links.md";
const SOURCE = [
  "# Links",
  "",
  "See [the paper](https://arxiv.org/abs/2110.14168), [mail](mailto:me@example.com),",
  "[$\\alpha$ notes](https://example.com/alpha), [a sibling](./other.md),",
  "[in Zotero](zotero://select/items/ABC123) and [the method](#the-method). [Top](#top).",
  "",
  "Plain text.",
  "",
  "## The Method",
  "",
  "Details.",
].join("\n");

async function openNote(app: TestContainer) {
  await act(async () => app.tabManager.openDocument(createMarkdownDocument(NOTE, SOURCE)));
  await settle();
}

function link(text: string, root = ".reader"): HTMLAnchorElement {
  const found = Array.from(document.querySelectorAll<HTMLAnchorElement>(`${root} a`)).find(
    (a) => a.textContent === text,
  );
  if (!found) throw new Error(`no link "${text}"`);
  return found;
}

/** Click an element; returns whether the default action (navigation) was prevented. */
function click(el: Element): boolean {
  let prevented = false;
  act(() => {
    prevented = !el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  return prevented;
}

describe("links in the reader", () => {
  it("open web and mail links outside the app instead of navigating", async () => {
    const app = makeContainer();
    await launch(app);
    await openNote(app);

    expect(click(link("the paper"))).toBe(true);
    expect(click(link("mail"))).toBe(true);
    expect(app.linkOpener.opened).toEqual(["https://arxiv.org/abs/2110.14168", "mailto:me@example.com"]);
  });

  it("handle a click on rendered math inside a link", async () => {
    const app = makeContainer();
    await launch(app);
    await openNote(app);
    const math = document.querySelector('.reader a[href="https://example.com/alpha"] .katex');
    if (!math) throw new Error("no math in the link");

    expect(click(math)).toBe(true);
    expect(app.linkOpener.opened).toEqual(["https://example.com/alpha"]);
  });

  it("never navigate for relative links or other schemes, and don't open them either", async () => {
    const app = makeContainer();
    await launch(app);
    await openNote(app);

    expect(click(link("a sibling"))).toBe(true);
    expect(click(link("in Zotero"))).toBe(true);
    expect(app.linkOpener.opened).toEqual([]);
  });

  it("scroll to a heading for #fragment links, and back to the top for #top", async () => {
    const app = makeContainer();
    await launch(app);
    await openNote(app);
    const scroller = document.querySelector<HTMLElement>(".reader-scroll");
    const heading = document.getElementById("user-content-the-method");
    if (!scroller || !heading) throw new Error("no reader or heading");
    // jsdom has no layout: place the heading 640px below the top of the visible area.
    scroller.getBoundingClientRect = () => new DOMRect(0, 50, 800, 600);
    heading.getBoundingClientRect = () => new DOMRect(0, 690, 800, 30);
    scroller.scrollTop = 100;

    expect(click(link("the method"))).toBe(true);
    expect(scroller.scrollTop).toBe(740);
    expect(click(link("Top"))).toBe(true);
    expect(scroller.scrollTop).toBe(0);
    expect(app.linkOpener.opened).toEqual([]);
  });

  it("leave clicks outside links alone", async () => {
    const app = makeContainer();
    await launch(app);
    await openNote(app);
    const paragraph = Array.from(document.querySelectorAll(".reader p")).find(
      (p) => p.textContent === "Plain text.",
    );
    if (!paragraph) throw new Error("no paragraph");

    expect(click(paragraph)).toBe(false);
    expect(app.linkOpener.opened).toEqual([]);
  });
});

describe("links in the edit-mode preview", () => {
  it("open web links outside the app and never navigate for other links", async () => {
    const app = makeContainer();
    await launch(app);
    await openNote(app);
    await act(async () => shortcut("KeyE"));
    await settle();
    const preview = ".editmode__pane--preview .reader";
    expect(document.querySelector(preview)).not.toBeNull();

    expect(click(link("the paper", preview))).toBe(true);
    expect(click(link("a sibling", preview))).toBe(true);
    expect(app.linkOpener.opened).toEqual(["https://arxiv.org/abs/2110.14168"]);
  });
});
