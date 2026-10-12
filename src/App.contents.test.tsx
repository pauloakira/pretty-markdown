import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMarkdownDocument, createPdfDocument } from "./domain/entities/Document";
import type { OutlineItem } from "./domain/values/Outline";
import { button, FILES, launch, makeContainer, settle, useAppHarness, type TestContainer } from "./test/appHarness";

/*
 * The contents sidebar: a markdown document's headings or a PDF's bookmarks as a tree,
 * to jump around the document (docs/ARCHITECTURE.md §9, 2026-10-12).
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const BOOK = "/papers/book.md";
const PLAIN = "/papers/plain.md";
const PDF = "/papers/quad/paper.pdf";

FILES[BOOK] = [
  "# Basics",
  "Intro.",
  "## Affine spaces",
  "## Energy of $u_h$",
  "### A detail",
  "# Convex sets",
  "## Carathéodory's theorem",
].join("\n\n");
FILES[PLAIN] = "Just a paragraph, no headings.";

const contents = () => document.querySelector('nav[aria-label="Contents"]');
/** The sidebar's rows as shown: their titles, indented two spaces per level. */
const rows = () =>
  [...document.querySelectorAll<HTMLElement>(".contents__row")].map((row) => {
    const depth = Math.round((parseFloat(row.style.paddingLeft) - 0.35) / 0.9);
    const title = row.querySelector(".contents__title")?.textContent ?? "";
    const page = row.querySelector(".contents__page")?.textContent;
    return `${"  ".repeat(depth)}${title}${page ? ` ·${page}` : ""}`;
  });
const current = () => document.querySelector(".contents__row--current .contents__title")?.textContent ?? null;
const item = (title: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".contents__item")].find(
    (b) => b.querySelector(".contents__title")?.textContent === title,
  )!;

function toggleShortcut() {
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL", metaKey: true, shiftKey: true, bubbles: true }));
}

async function openMarkdown(app: TestContainer, path: string) {
  await act(async () => app.tabManager.openDocument(createMarkdownDocument(path, FILES[path])));
  await settle();
}

describe("Contents sidebar, markdown", () => {
  it("shows the headings as a tree, chapters first, opening one at a time", async () => {
    const app = makeContainer();
    await launch(app);
    await openMarkdown(app, BOOK);
    expect(contents()).toBeNull();

    await act(async () => button("Contents").click());
    expect(contents()).not.toBeNull();
    expect(button("Contents").getAttribute("aria-pressed")).toBe("true");
    // jsdom lays nothing out, so every heading is "at the top": the last one is current,
    // and its chapter opens.
    expect(rows()).toEqual(["Basics", "Convex sets", "  Carathéodory’s theorem"]);

    await act(async () => button("Expand Basics").click());
    const shown = rows();
    expect(shown).toHaveLength(5);
    expect(shown[1]).toBe("  Affine spaces");
    expect(shown[2].startsWith("  Energy of ")).toBe(true);
    expect(shown.slice(3)).toEqual(["Convex sets", "  Carathéodory’s theorem"]);
    // The math in a heading shows rendered (KaTeX), as in the document.
    expect(item(shown[2].trim()).querySelector(".katex")).not.toBeNull();
    expect(item(shown[2].trim()).title).toBe("Energy of $u_h$");

    await act(async () => button("Collapse all").click());
    expect(rows()).toEqual(["Basics", "Convex sets"]);
    expect(current()).toBe("Convex sets"); // the chapter around the current section
  });

  it("filters sections, ignoring case and accents, with the chapters around them", async () => {
    const app = makeContainer();
    await launch(app);
    await openMarkdown(app, BOOK);
    await act(async () => button("Contents").click());

    const filter = document.querySelector<HTMLInputElement>(".contents__filter")!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(filter, "CARATHEODORY");
      filter.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows()).toEqual(["Convex sets", "  Carathéodory’s theorem"]);

    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(filter, "nothing like this");
      filter.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(contents()?.textContent).toContain("No sections match.");
  });

  it("jumps to a heading", async () => {
    const app = makeContainer();
    await launch(app);
    await openMarkdown(app, BOOK);
    await act(async () => button("Contents").click());

    const scroller = document.querySelector<HTMLElement>(".reader-scroll")!;
    const heading = document.getElementById(item("Convex sets").closest<HTMLElement>(".contents__row")!.dataset.outlineId!)!;
    heading.getBoundingClientRect = () => ({ top: 900 }) as DOMRect;
    await act(async () => item("Convex sets").click());
    expect(scroller.scrollTop).toBe(900 - 16);
  });

  it("is one setting for every document, and says when there are no headings", async () => {
    const app = makeContainer();
    await launch(app);
    await openMarkdown(app, BOOK);
    await act(async () => button("Contents").click());
    await openMarkdown(app, PLAIN);
    expect(contents()?.textContent).toContain("This document has no headings.");

    await act(async () => toggleShortcut());
    expect(contents()).toBeNull();
    await act(async () => toggleShortcut());
    expect(contents()).not.toBeNull();
  });

  it("isn't offered in edit mode", async () => {
    const app = makeContainer();
    await launch(app);
    await openMarkdown(app, BOOK);
    await act(async () => button("Edit").click());
    await settle();
    expect(() => button("Contents")).toThrow();
    await act(async () => toggleShortcut());
    expect(contents()).toBeNull();
  });
});

const bookmark = (id: string, title: string, position: number | null, children: OutlineItem[] = []): OutlineItem => ({
  id,
  title,
  position,
  children,
});

describe("Contents sidebar, PDF", () => {
  async function openPdf(app: TestContainer) {
    await act(async () => app.tabManager.openDocument(createPdfDocument(PDF)));
    await settle();
  }

  it("lists the bookmarks with their pages, follows the reader, and jumps", async () => {
    const app = makeContainer();
    app.pdfViewer.outline = [
      bookmark("b1", "1 Introduction", 0, [bookmark("b2", "1.1 Methods", 2.5)]),
      bookmark("b3", "2 Affine geometry", 8.25, [bookmark("b4", "2.4 Independence", 54.4)]),
      bookmark("b5", "A web link", null),
    ];
    await launch(app);
    await openPdf(app);
    await act(async () => toggleShortcut());
    await settle();

    expect(rows()).toEqual(["1 Introduction ·1", "2 Affine geometry ·9", "A web link"]);
    expect(current()).toBe("1 Introduction");
    expect(item("A web link").disabled).toBe(true);

    // Scrolling into section 2.4 opens chapter 2 and marks it.
    const viewer = app.pdfViewer.mounts[0];
    await act(async () => viewer.moveTo({ ...viewer.current, page: 55, pageOffset: 0.5 }));
    expect(rows()).toContain("  2.4 Independence ·55");
    expect(current()).toBe("2.4 Independence");

    await act(async () => item("2 Affine geometry").click());
    expect(viewer.jumps).toEqual([8.25]);
    expect(current()).toBe("2 Affine geometry");
  });

  it("says when the PDF has no table of contents", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    await act(async () => button("Contents").click());
    await settle();
    expect(contents()?.textContent).toContain("This PDF has no table of contents.");
  });
});
