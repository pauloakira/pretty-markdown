import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMarkdownDocument, createPdfDocument } from "./domain/entities/Document";
import { button, launch, makeContainer, NOTES, PDFS, settle, useAppHarness, type TestContainer } from "./test/appHarness";

/*
 * Notes made before the Notes folder sit right beside their PDF. The Notes panel offers,
 * once, to move them in with the others; their links are rebased as they go, and a tab
 * showing them follows them.
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const PDF = "/papers/ops/DeepONet.pdf";
const BESIDE = "/papers/ops/DeepONet.notes.md";
const MOVED = "/papers/ops/Notes/DeepONet.notes.md";
PDFS[PDF] = "%PDF-1.7 DeepONet";
const OLDER = "# Notes on DeepONet\n\n## Unsorted\n\n> Operators.\n> — [p. 2](DeepONet.pdf#page=2&ex=abcdef&color=yellow)\n";

async function openNotes(app: TestContainer) {
  await act(async () => app.tabManager.openDocument(createPdfDocument(PDF)));
  await settle();
  await act(async () => button("Notes").click());
  await settle();
}

const panelText = () => document.querySelector(".notes-panel")?.textContent ?? "";

describe("Moving older notes into the Notes folder", () => {
  it("moves them with their links, and the panel shows them from there", async () => {
    NOTES.set(BESIDE, OLDER);
    const app = makeContainer();
    await launch(app);
    await openNotes(app);
    expect(panelText()).toContain("Move these notes into the Notes folder?");
    expect(panelText()).toContain("Beside the PDF");

    await act(async () => button("Move").click());
    await settle();

    expect(NOTES.has(BESIDE)).toBe(false);
    expect(NOTES.get(MOVED)).toBe(OLDER.replace("](DeepONet.pdf", "](../DeepONet.pdf"));
    expect(panelText()).not.toContain("Move these notes");
    expect(panelText()).toContain("In the Notes folder beside the PDF");
    expect(panelText()).toContain("Operators.");
  });

  it("a tab showing the notes follows them; one with unsaved changes stops the move", async () => {
    NOTES.set(BESIDE, OLDER);
    const app = makeContainer();
    await launch(app);
    await act(async () => app.tabManager.openDocument(createMarkdownDocument(BESIDE, OLDER)));
    await act(async () => app.tabManager.updateContent(app.tabManager.getSnapshot().tabs[0]!.id, `${OLDER}\nDraft.\n`));
    await openNotes(app);

    await act(async () => button("Move").click());
    await settle();
    expect(panelText()).toContain("Save them first");
    expect(NOTES.has(BESIDE)).toBe(true);

    const notesTab = app.tabManager.getSnapshot().tabs[0]!;
    await act(async () => app.tabManager.reloadContent(notesTab.id, OLDER));
    await act(async () => button("Move").click());
    await settle();
    const followed = app.tabManager.getSnapshot().tabs.find((t) => t.id === notesTab.id);
    expect(followed?.document.path).toBe(MOVED);
    expect(followed?.document.kind === "markdown" && followed.document.content).toBe(NOTES.get(MOVED));
  });

  it("Keep here leaves them where they are and stops asking", async () => {
    NOTES.set(BESIDE, OLDER);
    const app = makeContainer();
    await launch(app);
    await openNotes(app);

    await act(async () => button("Keep here").click());
    await settle();
    expect(panelText()).not.toContain("Move these notes");
    expect(NOTES.get(BESIDE)).toBe(OLDER);

    await act(async () => button("Notes").click());
    await act(async () => button("Notes").click());
    await settle();
    expect(panelText()).toContain("Operators.");
    expect(panelText()).not.toContain("Move these notes");
  });
});
