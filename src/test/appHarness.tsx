import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import App from "../App";
import { DocumentService } from "../application/services/DocumentService";
import { PdfSaver } from "../application/services/PdfSaver";
import { SessionService } from "../application/services/SessionService";
import { TabManager } from "../application/services/TabManager";
import type { Container } from "../composition/container";
import { ContainerProvider } from "../composition/ContainerContext";
import type { AppWindow } from "../domain/ports/AppWindow";
import type { FilePicker, FileReader, FileWriter } from "../domain/ports/FileSystem";
import type { LinkOpener } from "../domain/ports/LinkOpener";
import { err, ok, type Result } from "../domain/values/Result";
import type { PdfView, PdfZoom } from "../domain/values/ViewState";
import { MarkdownPipeline } from "../infrastructure/markdown/MarkdownPipeline";
import { CompositeMathRenderer } from "../infrastructure/math/CompositeMathRenderer";
import { KatexRenderer } from "../infrastructure/math/KatexRenderer";
import { TauriSessionRepository } from "../infrastructure/persistence/TauriSessionRepository";
import type { HighlightColor } from "../domain/values/Highlight";
import type { FindState } from "../presentation/find/FindController";
import type { FindListener, FindTarget } from "../presentation/find/FindTarget";
import type {
  HighlightAvailability,
  PdfInfo,
  PdfMountOptions,
  PdfTool,
  PdfViewerFactory,
  PdfViewerHandle,
} from "../presentation/pdf/PdfViewer";
import { disk, listeners } from "./tauriMock";

/*
 * Shared harness for App-level tests: the real App and services wired to in-memory fakes
 * (files, dialogs, window, PDF viewer, link opener), plus launch/quit helpers. The
 * session goes through the real TauriSessionRepository against the mocked bridge in
 * ./tauriMock — each test file must mock "@tauri-apps/api/core" and "…/event" with it.
 */

/** Markdown files on the fake disk, by path. Tests may add to it. */
export const FILES: Record<string, string> = {
  "/papers/runge/docs/skeleton.md": "# Skeleton",
  "/papers/runge/docs/intro.md": "# Intro",
  "/papers/quad/docs/method.md": "# Method",
  "/papers/loose.md": "# Loose",
};

/** PDF files on the fake disk (just a valid header — the fake viewer doesn't parse). */
export const PDFS: Record<string, string> = {
  "/papers/quad/paper.pdf": "%PDF-1.7\n%âãÏÓ\n1 0 obj",
};

/** Bytes written to the fake disk (by PDF saves), by path. Read back before `PDFS`. */
export const WRITTEN = new Map<string, Uint8Array>();

export class FakeAppWindow implements AppWindow {
  handler: (() => void) | null = null;
  closed = 0;
  async onCloseRequested(handler: () => void) {
    this.handler = handler;
    return () => {};
  }
  async close() {
    this.closed += 1;
  }
}

/** A mounted fake PDF: records what the app asks of it, and can simulate the reader. */
export class FakePdfHandle implements PdfViewerHandle {
  destroyed = false;
  current: PdfView;
  tool: PdfTool = "select";
  color: HighlightColor;
  /** Highlights not saved yet (the fake's stand-in for pdf.js's annotation storage). */
  unsaved = 0;
  /** Highlights in the document, saved or not. */
  highlights = 0;
  /** Calls to `flush`, and whether `destroy` came after the last one finished. */
  flushes = 0;
  destroyedAfterFlush = false;
  constructor(
    readonly info: PdfInfo,
    private readonly options: PdfMountOptions,
    readonly highlighting: HighlightAvailability,
  ) {
    this.current = options.initialView;
    this.color = options.highlightColor;
  }
  setTool(tool: PdfTool) {
    this.tool = tool;
  }
  setHighlightColor(color: HighlightColor) {
    this.color = color;
  }
  /** What the find bar asked of this PDF, in order (e.g. "search:basis", "next"). */
  readonly findLog: string[] = [];
  private findListener: FindListener | null = null;
  find(listener: FindListener): FindTarget {
    this.findListener = listener;
    const log = this.findLog;
    return {
      search: (query) => log.push(`search:${query}`),
      next: () => log.push("next"),
      previous: () => log.push("previous"),
      clear: () => log.push("clear"),
    };
  }
  /** Simulate pdf.js reporting matches as it searches. */
  reportFind(state: FindState) {
    this.findListener?.(state);
  }
  /** Simulate pdf.js switching tools itself (e.g. the Highlight button by a selection). */
  switchToolItself(tool: PdfTool) {
    this.tool = tool;
    this.options.onToolChange(tool);
  }
  /** Simulate the reader highlighting a passage. */
  highlight() {
    this.highlights += 1;
    this.unsaved += 1;
  }
  async flush() {
    this.flushes += 1;
    if (this.unsaved === 0) return;
    const result = await this.options.onSave(new TextEncoder().encode(`%PDF-1.7 highlights=${this.highlights}`));
    if (result.ok) this.unsaved = 0;
  }
  view() {
    return this.current;
  }
  currentScale() {
    return this.current.zoom === "page-width" ? 1.5 : this.current.zoom;
  }
  setZoom(zoom: PdfZoom) {
    this.moveTo({ ...this.current, zoom });
  }
  goToPage(page: number) {
    this.moveTo({ ...this.current, page, pageOffset: 0 });
  }
  /** Simulate the reader scrolling or zooming. */
  moveTo(view: PdfView) {
    this.current = view;
    this.options.onViewChange(view);
  }
  clickExternalLink(url: string) {
    this.options.onExternalLink(url);
  }
  destroy() {
    this.destroyed = true;
    this.destroyedAfterFlush = this.flushes > 0;
  }
}

export class FakePdfViewerFactory implements PdfViewerFactory {
  readonly mounts: FakePdfHandle[] = [];
  /** Set to make the next mounts fail with this message. */
  failWith: string | null = null;
  info: PdfInfo = { pageCount: 12, title: "A Paper on Things" };
  highlighting: HighlightAvailability = { allowed: true };

  async mount(
    container: HTMLDivElement,
    _data: Uint8Array,
    options: PdfMountOptions,
  ): Promise<Result<PdfViewerHandle>> {
    if (this.failWith) return err(this.failWith);
    container.textContent = "[pdf pages]";
    const handle = new FakePdfHandle(this.info, options, this.highlighting);
    this.mounts.push(handle);
    return ok(handle);
  }

  /** The most recently mounted viewer. */
  get latest(): FakePdfHandle {
    const handle = this.mounts[this.mounts.length - 1];
    if (!handle) throw new Error("no PDF mounted");
    return handle;
  }
}

export class FakeLinkOpener implements LinkOpener {
  readonly opened: string[] = [];
  async openExternal(url: string) {
    this.opened.push(url);
  }
}

export type TestContainer = Container & {
  appWindow: FakeAppWindow;
  pdfViewer: FakePdfViewerFactory;
  linkOpener: FakeLinkOpener;
  /** Paths the open dialog will return, in order (null = cancelled). */
  picks: (string | null)[];
};

export function makeContainer(): TestContainer {
  const picks: (string | null)[] = [];
  const reader: FileReader = {
    async readTextFile(path) {
      return path in FILES ? ok(FILES[path]) : err("missing");
    },
    async readBytes(path, maxBytes) {
      const written = WRITTEN.get(path);
      if (written) return ok(maxBytes === undefined ? written : written.slice(0, maxBytes));
      const text = PDFS[path] ?? FILES[path];
      if (text === undefined) return err(`Failed to read '${path}': No such file`);
      const bytes = new TextEncoder().encode(text);
      return ok(maxBytes === undefined ? bytes : bytes.slice(0, maxBytes));
    },
  };
  const picker: FilePicker = {
    async pickDocument() {
      return picks.shift() ?? null;
    },
    async pickSavePath() {
      return null;
    },
  };
  const writer: FileWriter = {
    async writeTextFile() {
      return ok(undefined);
    },
    async writeBytes(path, bytes) {
      WRITTEN.set(path, bytes);
      return ok(undefined);
    },
  };
  const documentService = new DocumentService(picker, reader, writer);
  return {
    documentService,
    pipeline: new MarkdownPipeline(new CompositeMathRenderer([new KatexRenderer()]), {}),
    tabManager: new TabManager(),
    settingsRepository: { load: () => null, save: () => {} },
    recentFilesRepository: { load: () => [], save: () => {} },
    sessionService: new SessionService(new TauriSessionRepository(), documentService),
    appWindow: new FakeAppWindow(),
    documentExporter: { exportPdf: async () => {} },
    pdfViewer: new FakePdfViewerFactory(),
    pdfSaver: new PdfSaver(reader, writer),
    linkOpener: new FakeLinkOpener(),
    picks,
  };
}

/** Let pending promises (restore, autosave, file reads) run. */
export async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let root: Root | null = null;
let host: HTMLElement | null = null;

export async function launch(container: Container) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <ContainerProvider container={container}>
        <App />
      </ContainerProvider>,
    );
  });
  await settle();
}

/** Unmount the app (as if the process ended). */
export async function quit() {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
}

/** Answer the quit prompt (window close / ⌘Q) with the given button. */
export async function quitVia(container: TestContainer, label: string) {
  await act(async () => container.appWindow.handler?.());
  await act(async () => button(label).click());
  await settle();
}

export function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

/** Press a ⌘-shortcut. */
export function shortcut(code: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, metaKey: true, bubbles: true }));
}

// Browser APIs the webview has but jsdom lacks (used by the tab strip).
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Register the per-test setup/teardown. Call once at the top of a test file. */
export function useAppHarness() {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", NoopResizeObserver);
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    disk.session = null;
    WRITTEN.clear();
    listeners.clear();
  });
  afterEach(async () => {
    await quit();
    vi.unstubAllGlobals();
  });
}
