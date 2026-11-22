import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createPdfDocument } from "./domain/entities/Document";
import { readExcerpts } from "./domain/values/NotesFile";
import {
  button,
  launch,
  makeContainer,
  NOTES,
  settle,
  shortcut,
  useAppHarness,
  type TestContainer,
} from "./test/appHarness";

/*
 * Add to notes from a PDF tab (docs/RESEARCH_READER.md, R1): the selected passage goes to
 * "<name>.notes.md" beside the PDF and is highlighted. The fake viewer stands in for
 * pdf.js; its `selection` is what the reader has selected.
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const PDF = "/papers/quad/paper.pdf";
const NOTES_PATH = "/papers/quad/paper.notes.md";

async function openPdf(app: TestContainer) {
  await act(async () => app.tabManager.openDocument(createPdfDocument(PDF)));
  await settle();
  return app.pdfViewer.mounts[app.pdfViewer.mounts.length - 1];
}

const notice = () => document.querySelector(".notes-notice")?.textContent ?? null;

describe("Add to notes", () => {
  it("starts the notes file beside the PDF with the selected passage, and highlights it", async () => {
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    viewer.selection = { page: 4, text: "Gauss–Legendre nodes are\nthe roots of P_n." };

    await act(async () => button("Add to notes").click());
    await settle();

    expect(readExcerpts(NOTES.get(NOTES_PATH) ?? "")).toEqual([
      {
        heading: "Unsorted",
        excerpt: {
          id: "888888",
          source: "paper.pdf",
          page: 4,
          text: "Gauss–Legendre nodes are the roots of P_n.",
          color: "yellow",
        },
      },
    ]);
    expect(viewer.highlighted).toEqual(["yellow"]);
    expect(notice()).toContain("Started your notes: paper.notes.md");
  });

  it("adds with ⌘E too, without switching the PDF to edit mode", async () => {
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    viewer.selection = { page: 1, text: "First." };

    await act(async () => shortcut("KeyE"));
    await settle();

    expect(readExcerpts(NOTES.get(NOTES_PATH) ?? "").map((f) => f.excerpt.text)).toEqual(["First."]);
    expect(app.tabManager.getSnapshot().tabs[0].viewState.mode).toBe("reader"); // not edit mode
  });

  it("asks for a selection when nothing is selected, and writes nothing", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);

    await act(async () => button("Add to notes").click());
    await settle();

    expect(NOTES.has(NOTES_PATH)).toBe(false);
    expect(notice()).toContain("Select some text in the PDF first");
  });

  it("Remove takes the passage out of the notes again", async () => {
    const app = makeContainer();
    await launch(app);
    NOTES.set(NOTES_PATH, "# Mine\n\n## Unsorted\n");
    const viewer = await openPdf(app);
    viewer.selection = { page: 2, text: "Soon gone." };

    await act(async () => button("Add to notes").click());
    await settle();
    expect(notice()).toContain("Added to paper.notes.md");
    await act(async () => button("Remove from notes").click());
    await settle();

    expect(NOTES.get(NOTES_PATH)).toBe("# Mine\n\n## Unsorted\n");
    expect(notice()).toBeNull();
  });

  it("Open notes opens the notes file in a tab", async () => {
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    viewer.selection = { page: 2, text: "Read me later." };
    await act(async () => button("Add to notes").click());
    await settle();

    await act(async () => button("Open notes").click());
    await settle();

    const { tabs, activeTabId } = app.tabManager.getSnapshot();
    const active = tabs.find((t) => t.id === activeTabId);
    expect(active?.document.path).toBe(NOTES_PATH);
    expect(document.querySelector("blockquote")?.textContent).toContain("Read me later.");
  });
});
