import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMarkdownDocument, createPdfDocument } from "./domain/entities/Document";
import {
  button,
  FakePdfHandle,
  FILES,
  launch,
  makeContainer,
  settle,
  shortcut,
  useAppHarness,
  type TestContainer,
} from "./test/appHarness";

/*
 * Following a quote's link (docs/RESEARCH_READER.md, R1): "↗ p. 4" in the notes opens the
 * PDF at the passage and flashes it; a PDF that was already open gets a Back pill (⌘[) to
 * where the reader was. The contents and Go to page are jumps too.
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const PDF = "/papers/quad/paper.pdf";
const NOTES_PATH = "/papers/quad/paper.notes.md";
FILES[NOTES_PATH] = [
  "# Notes on paper",
  "> Gauss–Legendre nodes are the roots of P_n.\n> — [p. 4](paper.pdf#page=4&ex=abc123&color=blue&rect=72,600,300,612)",
  "Compare [the method](docs/method.md), [page 2](paper.pdf#page=2), [a figure](figure.png) and [a missing paper](gone.pdf#page=1).",
].join("\n\n");

async function openNotes(app: TestContainer) {
  await act(async () => app.tabManager.openDocument(createMarkdownDocument(NOTES_PATH, FILES[NOTES_PATH])));
  await settle();
}

async function openPdf(app: TestContainer) {
  await act(async () => app.tabManager.openDocument(createPdfDocument(PDF)));
  await settle();
  return app.pdfViewer.mounts[app.pdfViewer.mounts.length - 1];
}

async function follow(text: string) {
  const link = [...document.querySelectorAll<HTMLAnchorElement>(".reader a")].find((a) =>
    a.textContent?.includes(text),
  );
  if (!link) throw new Error(`no link "${text}"`);
  await act(async () => link.click());
  await settle();
}

const activePath = (app: TestContainer) => {
  const { tabs, activeTabId } = app.tabManager.getSnapshot();
  return tabs.find((t) => t.id === activeTabId)?.document.path;
};
const backPill = () => document.querySelector<HTMLButtonElement>(".back-pill");

describe("Following a quote's link", () => {
  it("opens its PDF at the page and shows the passage", async () => {
    const app = makeContainer();
    await launch(app);
    await openNotes(app);

    await follow("p. 4");

    expect(activePath(app)).toBe(PDF);
    const viewer = app.pdfViewer.mounts[0];
    expect(app.pdfViewer.mounts).toHaveLength(1);
    expect(viewer.revealed).toEqual([{ page: 4, rect: [72, 600, 300, 612] }]);
    expect(viewer.current.page).toBe(4);
    // Opened by the link: nowhere to go back to in this tab.
    expect(backPill()).toBeNull();
  });

  it("in a PDF that was open, Back returns to where the reader was", async () => {
    const app = makeContainer();
    await launch(app);
    const first = await openPdf(app);
    await act(async () => first.moveTo({ ...first.current, page: 9, pageOffset: 0.5 }));
    await openNotes(app);

    await follow("p. 4");

    const viewer = app.pdfViewer.mounts[app.pdfViewer.mounts.length - 1];
    expect(viewer).not.toBe(first);
    expect(viewer.revealed).toEqual([{ page: 4, rect: [72, 600, 300, 612] }]);
    expect(backPill()?.textContent).toContain("Back to p. 9");

    await act(async () => backPill()?.click());
    expect(viewer.jumps).toEqual([8.5]);
    expect(viewer.current).toMatchObject({ page: 9, pageOffset: 0.5 });
    expect(backPill()).toBeNull();
  });

  it("goes back with ⌘[ too, one jump at a time, across tab switches", async () => {
    const app = makeContainer();
    await launch(app);
    const first = await openPdf(app);
    await act(async () => first.moveTo({ ...first.current, page: 9, pageOffset: 0 }));
    await openNotes(app);
    await follow("p. 4");
    await openNotes(app);
    await follow("page 2");

    const viewer = app.pdfViewer.mounts[app.pdfViewer.mounts.length - 1];
    expect(viewer.revealed).toEqual([{ page: 2 }]);
    expect(backPill()?.textContent).toContain("Back to p. 4");
    await act(async () => shortcut("BracketLeft"));
    expect(backPill()?.textContent).toContain("Back to p. 9");
    await act(async () => shortcut("BracketLeft"));
    expect(viewer.current.page).toBe(9);
    expect(backPill()).toBeNull();
    await act(async () => shortcut("BracketLeft")); // nothing left: no-op
    expect(viewer.current.page).toBe(9);
  });

  it("still opens the page if showing the passage fails", async () => {
    const reveal = vi.spyOn(FakePdfHandle.prototype, "revealPassage").mockImplementation(() => {
      throw new TypeError("convertToViewportRectangle is not a function");
    });
    const app = makeContainer();
    await launch(app);
    await openNotes(app);

    await follow("p. 4");

    expect(activePath(app)).toBe(PDF);
    expect(app.pdfViewer.mounts[0].current.page).toBe(4);
    expect(document.querySelector(".pdftoolbar__page-input")).not.toBeNull();
    reveal.mockRestore();
  });

  it("opens linked Markdown files, and ignores files the app doesn't read or can't find", async () => {
    const app = makeContainer();
    await launch(app);
    await openNotes(app);

    await follow("a figure");
    expect(activePath(app)).toBe(NOTES_PATH);
    await follow("a missing paper");
    expect(activePath(app)).toBe(NOTES_PATH);
    expect(app.pdfViewer.mounts).toHaveLength(0);

    await follow("the method");
    expect(activePath(app)).toBe("/papers/quad/docs/method.md");
  });
});

describe("Back after jumps within a PDF", () => {
  it("the contents and Go to page are jumps Back returns from", async () => {
    const app = makeContainer();
    app.pdfViewer.outline = [{ id: "b1", title: "2 Affine geometry", position: 8.25, children: [] }];
    const viewer = await (async () => {
      await launch(app);
      return openPdf(app);
    })();
    await act(async () => viewer.moveTo({ ...viewer.current, page: 3, pageOffset: 0 }));
    expect(backPill()).toBeNull();

    await act(async () => button("Contents").click());
    await settle();
    const item = document.querySelector<HTMLButtonElement>(".contents__item");
    await act(async () => item?.click());
    expect(backPill()?.textContent).toContain("Back to p. 3");

    const field = document.querySelector<HTMLInputElement>(".pdftoolbar__page-input");
    if (!field) throw new Error("no page field");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "20");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(viewer.current.page).toBe(20);
    expect(backPill()?.textContent).toContain("Back to p. 9");

    await act(async () => backPill()?.click());
    expect(viewer.current.page).toBe(9);
    await act(async () => backPill()?.click());
    expect(viewer.current.page).toBe(3);
    expect(backPill()).toBeNull();
  });
});
