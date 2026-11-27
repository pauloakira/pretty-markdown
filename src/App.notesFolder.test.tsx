import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createPdfDocument } from "./domain/entities/Document";
import { readExcerpts } from "./domain/values/NotesFile";
import {
  button,
  FOLDER_PICKS,
  launch,
  LOCKED,
  makeContainer,
  NOTES,
  PDFS,
  settle,
  useAppHarness,
  type TestContainer,
} from "./test/appHarness";

/*
 * iPadOS gives the app a picked PDF, not its folder, so its notes file beside it can't be
 * made or read until the reader allows the folder. The Notes panel asks for it; a passage
 * added before that goes into the notes once the folder is allowed.
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const FOLDER = "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Articles/ops";
const PDF = `${FOLDER}/DeepONet.pdf`;
const NOTES_PATH = `${FOLDER}/Notes/DeepONet.notes.md`;
PDFS[PDF] = "%PDF-1.7 DeepONet";

async function openPdf(app: TestContainer) {
  await act(async () => app.tabManager.openDocument(createPdfDocument(PDF)));
  await settle();
  return app.pdfViewer.mounts[app.pdfViewer.mounts.length - 1];
}

const panelText = () => document.querySelector(".notes-panel")?.textContent ?? "";
const notice = () => document.querySelector(".notes-notice")?.textContent ?? null;

describe("Notes in a folder the app wasn't allowed into", () => {
  it("the Notes panel asks for the folder, and shows the notes once it's allowed", async () => {
    LOCKED.add(FOLDER);
    NOTES.set(NOTES_PATH, "# Notes on DeepONet\n\nWritten on the Mac.\n");
    const app = makeContainer();
    await launch(app);
    await openPdf(app);

    await act(async () => button("Notes").click());
    await settle();
    expect(panelText()).toContain("Allow the folder for your notes");
    expect(panelText()).toContain("DeepONet.notes.md");
    expect(panelText()).not.toContain("os error");

    FOLDER_PICKS.push(FOLDER.replace("/private/var/", "/var/")); // as the picker may name it
    await act(async () => button("Allow “ops”…").click());
    await settle();

    expect(panelText()).not.toContain("Allow the folder");
    expect(panelText()).toContain("Written on the Mac.");
  });

  it("a folder above it does as well", async () => {
    LOCKED.add(FOLDER);
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    await act(async () => button("Notes").click());
    await settle();

    FOLDER_PICKS.push(FOLDER.slice(0, FOLDER.lastIndexOf("/")));
    await act(async () => button("Allow “ops”…").click());
    await settle();

    expect(panelText()).toContain("No notes yet");
  });

  it("Add to notes highlights at once, and adds the passage when the folder is allowed", async () => {
    LOCKED.add(FOLDER);
    const app = makeContainer();
    await launch(app);
    const viewer = await openPdf(app);
    viewer.selection = { page: 5, text: "Number of sensors" };

    await act(async () => button("Add to notes").click());
    await settle();

    expect(viewer.highlighted).toEqual(["yellow"]); // never held up
    expect(notice()).toBeNull(); // no error banner: the panel explains
    expect(panelText()).toContain("goes into your notes as soon as the folder is allowed");
    expect(NOTES.has(NOTES_PATH)).toBe(false);

    FOLDER_PICKS.push(FOLDER);
    await act(async () => button("Allow “ops”…").click());
    await settle();

    expect(readExcerpts(NOTES.get(NOTES_PATH) ?? "").map((found) => found.excerpt.text)).toEqual([
      "Number of sensors",
    ]);
    expect(document.querySelectorAll(".notes-panel .excerpt-card")).toHaveLength(1);
  });

  it("says so when the folder chosen doesn't hold the PDF, and nothing changes on cancel", async () => {
    LOCKED.add(FOLDER);
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    await act(async () => button("Notes").click());
    await settle();

    FOLDER_PICKS.push(null);
    await act(async () => button("Allow “ops”…").click());
    await settle();
    expect(panelText()).toContain("Allow the folder for your notes");
    expect(panelText()).not.toContain("doesn't hold this PDF");

    FOLDER_PICKS.push("/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Elsewhere");
    await act(async () => button("Allow “ops”…").click());
    await settle();
    expect(panelText()).toContain("That folder doesn't hold this PDF. Choose “ops”, or a folder above it.");
  });
});
