import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMarkdownDocument, createPdfDocument } from "./domain/entities/Document";
import type { HardwareKeyCommands, KeyCommand } from "./presentation/keyboard/HardwareKeyCommands";
import { launch, makeContainer, settle, useAppHarness, type TestContainer } from "./test/appHarness";

/*
 * Keyboard shortcuts where the system keeps hardware keys from the page (iPadOS): the app
 * registers them with the system (here a fake), and a press is played to the page's own
 * handlers. The native side is ipad/tauri-plugin-ipad-files/ios/Sources/KeyCommands.swift.
 */

vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
vi.mock("@tauri-apps/api/event", async () => (await import("./test/tauriMock")).tauriEvent);

useAppHarness();

const PDF = "/papers/quad/paper.pdf";

class FakeKeyCommands implements HardwareKeyCommands {
  registered: readonly KeyCommand[] = [];
  private listener: ((id: string) => void) | null = null;
  set(commands: readonly KeyCommand[]) {
    this.registered = commands;
  }
  onPress(listener: (id: string) => void) {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }
  ids() {
    return this.registered.map((c) => c.id);
  }
  /** The reader presses a registered shortcut. */
  async press(id: string) {
    if (!this.ids().includes(id)) throw new Error(`${id} isn't registered now`);
    await act(async () => this.listener?.(id));
    await settle();
  }
}

async function setup(): Promise<{ app: TestContainer; keys: FakeKeyCommands }> {
  const keys = new FakeKeyCommands();
  const app = { ...makeContainer(), keyCommands: keys };
  await launch(app);
  return { app, keys };
}

async function openPdf(app: TestContainer) {
  await act(async () => app.tabManager.openDocument(createPdfDocument(PDF)));
  await settle();
  return app.pdfViewer.latest;
}

describe("Keyboard shortcuts through the system's key commands (iPadOS)", () => {
  it("registers the shortcuts for what's showing, and changes them with the tab", async () => {
    const { app, keys } = await setup();
    expect(keys.ids()).toContain("new-tab");
    expect(keys.ids()).not.toContain("zoom-in");

    await openPdf(app);
    expect(keys.ids()).toEqual(expect.arrayContaining(["zoom-in", "add-to-notes", "undo"]));

    await act(async () => app.tabManager.openDocument(createMarkdownDocument("/notes/a.md", "# A\n\nText.")));
    await settle();
    expect(keys.ids()).toEqual(expect.arrayContaining(["read-edit", "export-pdf"]));
    expect(keys.ids()).not.toContain("zoom-in");
  });

  it("plays a press to the page's handlers: zoom, Fit width, find, Escape", async () => {
    const { app, keys } = await setup();
    const viewer = await openPdf(app);

    await keys.press("zoom-in");
    expect(viewer.view().zoom).not.toBe("page-width");
    await keys.press("fit-width");
    expect(viewer.view().zoom).toBe("page-width");

    await keys.press("find");
    expect(document.querySelector(".findbar")).not.toBeNull();
    await keys.press("escape");
    expect(document.querySelector(".findbar")).toBeNull();
  });

  it("undoes and redoes highlights with ⌘Z / ⌘⇧Z", async () => {
    const { app, keys } = await setup();
    const viewer = await openPdf(app);
    await keys.press("undo");
    await keys.press("redo");
    expect(viewer.historyLog).toEqual(["undo", "redo"]);
  });

  it("scrolls the document with the reading keys, and leaves them to a field being edited", async () => {
    const { app, keys } = await setup();
    await openPdf(app);
    const scroller = document.querySelector<HTMLElement>(".pdf-reader__scroll")!;
    Object.defineProperty(scroller, "clientHeight", { value: 1000, configurable: true });

    await keys.press("page-down");
    expect(scroller.scrollTop).toBe(900);
    await keys.press("line-up");
    expect(scroller.scrollTop).toBe(852);
    await keys.press("top");
    expect(scroller.scrollTop).toBe(0);

    // Typing in the find field: arrows, Space, ⌘Z are the field's.
    await keys.press("find");
    const field = document.querySelector<HTMLInputElement>(".findbar__input")!;
    await act(async () => field.focus());
    await settle();
    expect(keys.ids()).not.toContain("space");
    expect(keys.ids()).not.toContain("undo");
    expect(keys.ids()).toContain("escape");
  });
});
