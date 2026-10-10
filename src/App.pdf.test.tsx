import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMarkdownDocument, createPdfDocument } from "./domain/entities/Document";
import { CHANGED_ON_DISK } from "./application/services/PdfSaver";
import {
  button,
  FILES,
  launch,
  makeContainer,
  quit,
  quitVia,
  settle,
  shortcut,
  useAppHarness,
  type TestContainer,
  WRITTEN,
} from "./test/appHarness";
import { disk } from "./test/tauriMock";

/*
 * PDF tabs in the running app, with a fake viewer standing in for pdf.js (the real
 * adapter is exercised in a browser/webview; see docs/PDF_PLAN.md §6).
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const PDF = "/papers/quad/paper.pdf";
const NOTE = "/papers/runge/docs/intro.md";

/** The page field, zoom label and "Fit width" state as shown in the PDF toolbar. */
function toolbar() {
  return {
    page: document.querySelector<HTMLInputElement>(".pdftoolbar__page-input")?.value,
    of: document.querySelector(".pdftoolbar__page-count")?.textContent,
    zoom: document.querySelector(".pdftoolbar__zoom")?.textContent,
    fitWidth: button("Fit width").getAttribute("aria-pressed") === "true",
  };
}

async function openPdf(app: TestContainer) {
  await act(async () => app.tabManager.openDocument(createPdfDocument(PDF)));
  await settle();
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe("PDF tabs", () => {
  it("open from the dialog into the viewer, with a PDF toolbar instead of the markdown one", async () => {
    const app = makeContainer();
    app.picks.push(PDF);
    await launch(app);
    await act(async () => button("Open a document").click());
    await settle();

    expect(app.tabManager.getSnapshot().tabs[0].document).toEqual({
      kind: "pdf",
      path: PDF,
      name: "paper.pdf",
    });
    expect(app.pdfViewer.mounts).toHaveLength(1);
    expect(app.pdfViewer.latest.current).toEqual({ page: 1, pageOffset: 0, zoom: "page-width" });
    expect(toolbar()).toEqual({ page: "1", of: "/ 12", zoom: "150%", fitWidth: true });
    expect(document.querySelector(".doctoolbar__name")?.getAttribute("title")).toBe("A Paper on Things");
    expect(document.querySelector(".reader")).toBeNull(); // not rendered as markdown
    expect(Array.from(document.querySelectorAll("button")).map((b) => b.textContent)).not.toContain("Edit");
  });

  it("drives the viewer from the toolbar and ⌘+ / ⌘− / ⌘0", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    const viewer = app.pdfViewer.latest;

    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.click());
    expect(viewer.current.zoom).toBe(1.75); // fit-width was 150%
    expect(toolbar()).toMatchObject({ zoom: "175%", fitWidth: false });

    await act(async () => shortcut("Minus"));
    expect(viewer.current.zoom).toBe(1.5);
    await act(async () => shortcut("Equal"));
    expect(viewer.current.zoom).toBe(1.75);
    await act(async () => shortcut("Digit0"));
    expect(viewer.current.zoom).toBe("page-width");
    expect(toolbar().fitWidth).toBe(true);

    const field = document.querySelector<HTMLInputElement>(".pdftoolbar__page-input");
    if (!field) throw new Error("no page field");
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(field, "7");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(viewer.current.page).toBe(7);
    expect(toolbar().page).toBe("7");
  });

  it("ignores edit, save and export shortcuts", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    const save = vi.spyOn(app.documentService, "save");
    const exportPdf = vi.spyOn(app.documentExporter, "exportPdf");

    await act(async () => {
      shortcut("KeyE");
      shortcut("KeyS");
      shortcut("KeyP");
    });
    expect(app.tabManager.getSnapshot().tabs[0].viewState.mode).toBe("reader");
    expect(save).not.toHaveBeenCalled();
    expect(exportPdf).not.toHaveBeenCalled();
  });

  it("opens external links through the link opener", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    app.pdfViewer.latest.clickExternalLink("https://arxiv.org/abs/2110.14168");
    expect(app.linkOpener.opened).toEqual(["https://arxiv.org/abs/2110.14168"]);
  });

  it("remembers the position: while reading, across tab switches, and through quit and relaunch", async () => {
    const first = makeContainer();
    await launch(first);
    await act(async () => first.tabManager.openDocument(createMarkdownDocument(NOTE, FILES[NOTE])));
    await openPdf(first);
    const pdfTab = () => first.tabManager.getSnapshot().tabs[1];

    // Recorded once scrolling settles (debounced like the markdown reader).
    await act(async () => first.pdfViewer.latest.moveTo({ page: 4, pageOffset: 0.5, zoom: 1.25 }));
    expect(pdfTab().viewState.pdf?.page).toBe(1);
    await wait(450);
    expect(pdfTab().viewState.pdf).toEqual({ page: 4, pageOffset: 0.5, zoom: 1.25 });

    // Switching away records the latest position at once and releases the viewer.
    const firstViewer = first.pdfViewer.latest;
    await act(async () => firstViewer.moveTo({ page: 5, pageOffset: 0.1, zoom: 1.25 }));
    await act(async () => first.tabManager.activateTab(first.tabManager.getSnapshot().tabs[0].id));
    expect(firstViewer.destroyed).toBe(true);
    expect(pdfTab().viewState.pdf).toEqual({ page: 5, pageOffset: 0.1, zoom: 1.25 });

    // Switching back reopens it where it was.
    await act(async () => first.tabManager.activateTab(pdfTab().id));
    await settle();
    expect(first.pdfViewer.latest.current).toEqual({ page: 5, pageOffset: 0.1, zoom: 1.25 });

    // A move right before quitting (inside the debounce) is still saved by the prompt.
    await act(async () => first.pdfViewer.latest.moveTo({ page: 9, pageOffset: 0.25, zoom: 2 }));
    await quitVia(first, "Reopen next time");
    const saved = JSON.parse(disk.session ?? "null");
    expect(saved.tabs[1].pdf).toEqual({ page: 9, pageOffset: 0.25, zoom: 2 });
    await quit();

    const second = makeContainer();
    await launch(second);
    expect(second.pdfViewer.latest.current).toEqual({ page: 9, pageOffset: 0.25, zoom: 2 });
    expect(toolbar()).toMatchObject({ page: "9", zoom: "200%", fitWidth: false });
  });

  it("shows an error instead of the document when the file is gone", async () => {
    const app = makeContainer();
    await launch(app);
    // A tab whose file was deleted after it was opened.
    await act(async () => app.tabManager.openDocument(createPdfDocument("/papers/deleted.pdf")));
    await settle();

    expect(document.querySelector('[role="alert"]')?.textContent).toContain("No such file");
    expect(app.pdfViewer.mounts).toHaveLength(0);
    expect(toolbar()).toMatchObject({ of: "/ –", zoom: "–" });
  });

  it("shows the viewer's error when a PDF can't be opened", async () => {
    const app = makeContainer();
    await launch(app);
    app.pdfViewer.failWith = "This PDF is password-protected. Opening protected PDFs isn't supported yet.";
    await openPdf(app);

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "This PDF is password-protected. Opening protected PDFs isn't supported yet.",
    );
  });
});

describe("PDF highlights", () => {
  const highlightButton = () => button("Highlight");
  const pressed = (b: HTMLButtonElement) => b.getAttribute("aria-pressed") === "true";
  const savedText = () => new TextDecoder().decode(WRITTEN.get(PDF));

  it("turns highlight mode on and off from the toolbar, ⌘⇧H and Esc", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    const viewer = app.pdfViewer.latest;
    expect(viewer.tool).toBe("select");
    expect(pressed(highlightButton())).toBe(false);

    await act(async () => highlightButton().click());
    expect(viewer.tool).toBe("highlight");
    expect(pressed(highlightButton())).toBe(true);
    expect(document.querySelector(".pdf-reader__stage--highlighting")).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyH", metaKey: true, shiftKey: true }));
    });
    expect(viewer.tool).toBe("select");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyH", metaKey: true, shiftKey: true }));
    });
    expect(viewer.tool).toBe("highlight");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
    });
    expect(viewer.tool).toBe("select");
    expect(pressed(highlightButton())).toBe(false);
  });

  it("follows the viewer when it enters highlight mode by itself", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    // The Highlight button next to a selection puts pdf.js in highlight mode.
    await act(async () => app.pdfViewer.latest.switchToolItself("highlight"));
    expect(pressed(highlightButton())).toBe(true);
    await act(async () => highlightButton().click());
    expect(app.pdfViewer.latest.tool).toBe("select");
    expect(pressed(highlightButton())).toBe(false);
  });

  it("picks the colour from the menu, and remembers it for the next PDF", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    expect(app.pdfViewer.latest.color).toBe("yellow");

    await act(async () => button("Highlight colour").click());
    await act(async () => button("Green").click());
    expect(app.pdfViewer.latest.color).toBe("green");
    expect(document.querySelector('[role="menu"]')).toBeNull(); // closed after picking

    // A PDF opened later starts with the new colour.
    await act(async () => app.tabManager.openDocument(createMarkdownDocument(NOTE, FILES[NOTE])));
    await act(async () => app.tabManager.activateTab(app.tabManager.getSnapshot().tabs[0].id));
    await settle();
    expect(app.pdfViewer.mounts).toHaveLength(2);
    expect(app.pdfViewer.latest.color).toBe("green");
  });

  it("is disabled, with the reason, for a PDF that can't be highlighted", async () => {
    const app = makeContainer();
    await launch(app);
    const reason = "This PDF is digitally signed: highlighting it would invalidate the signature.";
    app.pdfViewer.highlighting = { allowed: false, reason };
    await openPdf(app);

    expect(highlightButton().disabled).toBe(true);
    expect(highlightButton().title).toBe(reason);
    expect(button("Highlight colour").disabled).toBe(true);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyH", metaKey: true, shiftKey: true }));
    });
    expect(app.pdfViewer.latest.tool).toBe("select");
  });

  it("saves pending highlights into the file when switching tabs, before releasing the viewer", async () => {
    const app = makeContainer();
    await launch(app);
    await act(async () => app.tabManager.openDocument(createMarkdownDocument(NOTE, FILES[NOTE])));
    await openPdf(app);
    const viewer = app.pdfViewer.latest;
    viewer.highlight();

    await act(async () => app.tabManager.activateTab(app.tabManager.getSnapshot().tabs[0].id));
    await settle();
    expect(savedText()).toBe("%PDF-1.7 highlights=1");
    expect(viewer.destroyed).toBe(true);
    expect(viewer.destroyedAfterFlush).toBe(true);

    // Reopening reads the saved file, and its next save goes through.
    await act(async () => app.tabManager.activateTab(app.tabManager.getSnapshot().tabs[1].id));
    await settle();
    const reopened = app.pdfViewer.latest;
    reopened.highlight();
    reopened.highlight();
    await act(async () => reopened.flush());
    expect(savedText()).toBe("%PDF-1.7 highlights=2");
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("saves pending highlights when quitting, whichever way the prompt is answered", async () => {
    for (const answer of ["Reopen next time", "Don't reopen"]) {
      WRITTEN.clear();
      const app = makeContainer();
      await launch(app);
      await openPdf(app);
      app.pdfViewer.latest.highlight();
      await quitVia(app, answer);
      expect(savedText()).toBe("%PDF-1.7 highlights=1");
      await quit();
    }
  });

  it("saves when the app goes to the background", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    app.pdfViewer.latest.highlight();

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await settle();
    expect(savedText()).toBe("%PDF-1.7 highlights=1");
  });

  it("won't overwrite a PDF that changed on disk, and says so", async () => {
    const app = makeContainer();
    await launch(app);
    await openPdf(app);
    // Another app replaces the file while it's open (e.g. LaTeX recompiled it).
    WRITTEN.set(PDF, new TextEncoder().encode("%PDF-1.7 recompiled"));
    app.pdfViewer.latest.highlight();
    await act(async () => app.pdfViewer.latest.flush());

    expect(savedText()).toBe("%PDF-1.7 recompiled");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(CHANGED_ON_DISK);
    expect(app.pdfViewer.latest.unsaved).toBe(1); // kept, not marked as saved
  });
});
