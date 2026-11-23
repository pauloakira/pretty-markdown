import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPdfDocument } from "./domain/entities/Document";
import { readExcerpts } from "./domain/values/NotesFile";
import {
  launch,
  makeContainer,
  NOTES,
  settle,
  shortcut,
  useAppHarness,
  type TestContainer,
} from "./test/appHarness";

/*
 * The selection popover (docs/RESEARCH_READER.md, R1): on the Mac, a selection in a PDF
 * offers its colours, Add to notes, Comment and Copy as quote. The fake viewer stands in
 * for pdf.js; `select` is the reader finishing a selection.
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const PDF = "/papers/quad/paper.pdf";
const NOTES_PATH = "/papers/quad/paper.notes.md";
const PASSAGE = { page: 4, text: "Gauss–Legendre nodes are\nthe roots of P_n." };

async function openPdf(app: TestContainer) {
  await act(async () => app.tabManager.openDocument(createPdfDocument(PDF)));
  await settle();
  return app.pdfViewer.mounts[app.pdfViewer.mounts.length - 1];
}

const popover = () => document.querySelector<HTMLElement>(".selection-popover");
/** A button in the popover, by its text or label. */
const action = (label: string) => {
  const found = [...(popover()?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent?.startsWith(label) || b.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`no popover button "${label}"`);
  return found;
};
const notesFile = () => NOTES.get(NOTES_PATH) ?? "";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("The selection popover", () => {
  it("shows by a finished selection, in place of pdf.js's own Highlight button, and goes with it", async () => {
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    expect(viewer.selectionActions).toBe(true);
    expect(popover()).toBeNull();

    await act(async () => viewer.select(PASSAGE));
    expect(popover()).not.toBeNull();
    expect(action("Highlight yellow").getAttribute("aria-pressed")).toBe("true"); // the highlighter colour

    await act(async () => viewer.select(null));
    expect(popover()).toBeNull();
  });

  it("a colour highlights the passage in it, and becomes the highlighter colour", async () => {
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    await act(async () => viewer.select(PASSAGE));

    await act(async () => action("Highlight pink").click());
    await settle();

    expect(viewer.highlighted).toEqual(["pink"]);
    expect(viewer.color).toBe("pink");
    expect(popover()).toBeNull();
    expect(notesFile()).toBe(""); // highlighting alone doesn't touch the notes

    await act(async () => viewer.select(PASSAGE));
    expect(action("Highlight pink").getAttribute("aria-pressed")).toBe("true");
  });

  it("Add to notes quotes and highlights the passage, as the toolbar's does", async () => {
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    await act(async () => viewer.select(PASSAGE));

    await act(async () => action("Add to notes").click());
    await settle();

    expect(readExcerpts(notesFile()).map((f) => f.excerpt.text)).toEqual(["Gauss–Legendre nodes are the roots of P_n."]);
    expect(viewer.highlighted).toEqual(["yellow"]);
    expect(popover()).toBeNull();
  });

  it("Comment highlights the passage at once, then adds it with the comment below", async () => {
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    await act(async () => viewer.select(PASSAGE));

    await act(async () => action("Comment").click());
    await settle();
    expect(viewer.places).toHaveLength(1); // highlighted while the comment is written
    const field = popover()?.querySelector("textarea");
    if (!field) throw new Error("no comment field");
    expect(document.activeElement).toBe(field);
    // pdf.js drops the selection as it highlights; the field stays.
    await act(async () => viewer.select(null));

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setValue?.call(field, "Compare Golub–Welsch.");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await settle();

    expect(popover()).toBeNull();
    expect(readExcerpts(notesFile())).toHaveLength(1);
    expect(notesFile()).toMatch(/&rect=72,668,300,680\)\n\nCompare Golub–Welsch\.\n$/);
    expect(viewer.highlighted).toEqual(["yellow"]); // the one highlight, not a second

    // The notice's Remove takes the quote, its comment and its highlight away again.
    await act(async () => {
      const remove = document.querySelector<HTMLButtonElement>('.notes-notice button[aria-label="Remove from notes"]');
      remove?.click();
    });
    await settle();
    expect(readExcerpts(notesFile())).toHaveLength(0);
    expect(notesFile()).not.toContain("Golub");
    expect(viewer.places).toHaveLength(0);
  });

  it("cancelling a comment takes its highlight off again and writes nothing", async () => {
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    await act(async () => viewer.select(PASSAGE));
    await act(async () => action("Comment").click());
    await settle();

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(popover()).toBeNull();
    expect(viewer.places).toHaveLength(0);
    expect(notesFile()).toBe("");
  });

  it("Copy as quote copies a Markdown quote linking to the page", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    await act(async () => viewer.select(PASSAGE));

    await act(async () => action("Copy as quote").click());
    await settle();

    expect(writeText).toHaveBeenCalledWith(
      "> Gauss–Legendre nodes are the roots of P\\_n.\n> — [p. 4](paper.pdf#page=4)",
    );
    expect(action("Copied")).toBeDefined();
    expect(viewer.highlighted).toEqual([]);
    expect(notesFile()).toBe("");
  });

  it("offers no colours on a PDF that can't be highlighted, but still adds to the notes", async () => {
    const app = makeContainer();
    app.pdfViewer.highlighting = { allowed: false, reason: "signed" };
    await launch(app);
    const viewer = await openPdf(app);
    await act(async () => viewer.select(PASSAGE));

    expect(popover()?.querySelector(".selection-popover__colours")).toBeNull();
    await act(async () => action("Add to notes").click());
    await settle();
    expect(readExcerpts(notesFile())[0]?.excerpt.rect).toBeUndefined();
  });

  it("isn't shown in highlight mode, where a selection is highlighted straight away", async () => {
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    await act(async () => shortcut("KeyH", { shift: true }));
    await act(async () => viewer.select(PASSAGE));
    expect(popover()).toBeNull();
  });
});
