import { describe, expect, it } from "vitest";
import { keydownFor, SHORTCUTS, shortcutsFor } from "./shortcuts";

const keyOf = (s: { input: string; modifiers: readonly string[] }) => `${[...s.modifiers].sort().join("+")}+${s.input}`;

describe("the keyboard shortcuts for the system (iPadOS)", () => {
  it("have distinct ids", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never register one key twice in a context (⌘E is Read/Edit for markdown, Add to notes for a PDF)", () => {
    for (const showing of ["pdf", "markdown", null] as const) {
      for (const editing of [false, true]) {
        const keys = shortcutsFor(showing, editing).map(keyOf);
        expect(new Set(keys).size, `${showing} editing=${editing}`).toBe(keys.length);
      }
    }
  });

  it("offer each document's own shortcuts only with it showing", () => {
    const ids = (showing: "pdf" | "markdown" | null) => shortcutsFor(showing).map((s) => s.id);
    expect(ids("pdf")).toEqual(expect.arrayContaining(["zoom-in", "add-to-notes", "notes", "undo", "find", "new-tab"]));
    expect(ids("pdf")).not.toContain("export-pdf");
    expect(ids("markdown")).toEqual(expect.arrayContaining(["read-edit", "export-pdf", "save-as", "find"]));
    expect(ids("markdown")).not.toContain("zoom-in");
    expect(ids(null)).not.toContain("zoom-in");
  });

  it("leave the reading keys and undo to a text field while one is being edited", () => {
    const editing = shortcutsFor("pdf", true).map((s) => s.id);
    for (const id of ["line-down", "space", "page-down", "top", "undo", "redo"]) expect(editing).not.toContain(id);
    // ⌘ shortcuts and Escape still work there.
    expect(editing).toEqual(expect.arrayContaining(["find", "add-to-notes", "escape"]));
  });

  it("list ⌘ shortcuts by name in the system's overlay, and keep Tab, Escape and the reading keys out of it", () => {
    for (const s of SHORTCUTS) {
      const listed = s.title !== "";
      const quiet = s.scroll || s.id === "escape" || s.id.endsWith("-ctrl") || (s.id.startsWith("tab-") && s.id !== "tab-1");
      expect(listed, s.id).toBe(!quiet);
    }
  });

  it("only let text fields keep the keys they need", () => {
    for (const s of SHORTCUTS) expect(s.priority, s.id).toBe(true);
  });

  it("play as the keydown a Mac keyboard sends", () => {
    const zoomIn = SHORTCUTS.find((s) => s.id === "zoom-in")!;
    expect(keydownFor(zoomIn)).toMatchObject({ key: "=", code: "Equal", metaKey: true, shiftKey: false, ctrlKey: false });
    const previous = SHORTCUTS.find((s) => s.id === "previous-tab-ctrl")!;
    expect(keydownFor(previous)).toMatchObject({ code: "Tab", ctrlKey: true, shiftKey: true, metaKey: false });
  });
});
