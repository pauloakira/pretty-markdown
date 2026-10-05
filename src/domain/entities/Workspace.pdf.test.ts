import { describe, expect, it } from "vitest";
import { parseSession } from "../values/Session";
import { initialPdfView } from "../values/ViewState";
import { createMarkdownDocument, createPdfDocument } from "./Document";
import { createTab, isTabDirty } from "./Tab";
import * as W from "./Workspace";

const md = (id: string) => createTab(id, createMarkdownDocument(`/notes/${id}.md`, `# ${id}`));
const pdf = (id: string) => createTab(id, createPdfDocument(`/papers/${id}.pdf`));

function workspaceOf(...tabs: ReturnType<typeof createTab>[]): W.Workspace {
  return tabs.reduce<W.Workspace>((ws, t) => W.addTab(ws, t), W.emptyWorkspace);
}

describe("Workspace with PDF tabs", () => {
  it("creates a PDF tab in reader mode with the initial PDF view, never dirty", () => {
    const tab = pdf("paper");
    expect(tab.viewState).toEqual({ scrollTop: 0, mode: "reader", pdf: initialPdfView });
    expect(tab.savedContent).toBeNull();
    expect(isTabDirty(tab)).toBe(false);
    expect(md("notes").viewState.pdf).toBeUndefined();
  });

  it("ignores markdown-only operations on a PDF tab", () => {
    const ws = workspaceOf(pdf("paper"));
    expect(W.setMode(ws, "paper", "edit")).toBe(ws);
    expect(W.updateContent(ws, "paper", "# typed into a PDF?")).toBe(ws);
    expect(W.reloadContent(ws, "paper", "# from disk")).toBe(ws);
    expect(W.markSaved(ws, "paper", { path: "/x.md", name: "x.md" })).toBe(ws);
  });

  it("stores a PDF view clamped into range, and only on PDF tabs", () => {
    const ws = workspaceOf(pdf("paper"), md("notes"));
    const moved = W.setPdfView(ws, "paper", { page: 12, pageOffset: 0.3, zoom: 9 });
    expect(moved.tabs[0].viewState.pdf).toEqual({ page: 12, pageOffset: 0.3, zoom: 4 });
    expect(W.setPdfView(moved, "paper", { page: 12, pageOffset: 0.3, zoom: 4 })).toBe(moved);
    expect(W.setPdfView(ws, "notes", { page: 2, pageOffset: 0, zoom: 1 })).toBe(ws);
    expect(W.setPdfView(ws, "nope", { page: 2, pageOffset: 0, zoom: 1 })).toBe(ws);
  });

  it("writes the PDF view into the session for PDF tabs only, and reads it back", () => {
    const ws = W.setPdfView(workspaceOf(md("notes"), pdf("paper")), "paper", {
      page: 5,
      pageOffset: 0.25,
      zoom: "page-width",
    });
    const session = W.toSession(ws);
    expect(session.version).toBe(3);
    expect(session.tabs[0]).not.toHaveProperty("pdf");
    expect(session.tabs[1].pdf).toEqual({ page: 5, pageOffset: 0.25, zoom: "page-width" });

    // Round-trip through JSON, as on disk: parsing yields the identical serialization, so a
    // restored session is the autosave baseline (no rewrite on launch).
    const reparsed = parseSession(JSON.parse(JSON.stringify(session)));
    expect(JSON.stringify(reparsed)).toBe(JSON.stringify(session));
  });
});
