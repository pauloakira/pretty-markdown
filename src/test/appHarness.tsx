import { TauriFileWatcher } from "../infrastructure/fs/TauriFileWatcher";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import App from "../App";
import { DocumentService } from "../application/services/DocumentService";
import { NotesService } from "../application/services/NotesService";
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
import { sameArea, type HighlightPlace } from "../domain/values/PdfRect";
import type { OutlineItem } from "../domain/values/Outline";
import type { FindState } from "../presentation/find/FindController";
import type { FindListener, FindTarget } from "../presentation/find/FindTarget";
import type {
  HighlightAvailability,
  PdfInfo,
  PdfMountOptions,
  SelectedPassage,
  PdfSource,
  PdfTool,
  PdfViewerFactory,
  PdfViewerHandle,
  PassageTarget,
} from "../presentation/pdf/PdfViewer";
import { disk, listeners } from "./tauriMock";
import { folderHolds, NO_ACCESS } from "../domain/values/FileAccess";
import { MISSING_FILE } from "../domain/values/MissingFile";

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
/** Notes files "on disk" (path → text), read and written through the notes store. */
export const NOTES = new Map<string, string>();
/** Folders the app hasn't been allowed into (iPadOS): notes in them can't be read or written. */
export const LOCKED = new Set<string>();
/** Folders the folder picker will return, in order (null = cancelled). */
export const FOLDER_PICKS: (string | null)[] = [];

/** What the native side says for a file in a folder the app wasn't allowed into. */
const locked = (path: string) =>
  [...LOCKED].some((folder) => folderHolds(folder, path)) ? `'${path.split("/").pop()}' ${NO_ACCESS}` : null;

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
    this.current = options.initialView();
    this.color = options.highlightColor;
  }
  setTool(tool: PdfTool) {
    this.tool = tool;
  }
  setHighlightColor(color: HighlightColor) {
    this.color = color;
  }
  /** What a test has "selected" in this PDF (null: nothing). */
  selection: SelectedPassage | null = null;
  /** Colours of the selections highlighted through `highlightSelection`, in order. */
  readonly highlighted: HighlightColor[] = [];
  selectedPassage() {
    return this.selection;
  }
  /** Where the highlights made through `highlightSelection` are, while they're there. */
  readonly places: HighlightPlace[] = [];
  async highlightSelection(): Promise<HighlightPlace | null> {
    await Promise.resolve();
    if (!this.highlighting.allowed || this.selection === null) return null;
    this.highlighted.push(this.color);
    // One line each, down the page.
    const top = 700 - 20 * this.highlighted.length;
    const place: HighlightPlace = { page: this.selection.page, rect: [72, top - 12, 300, top] };
    this.places.push(place);
    return place;
  }
  /** Highlights recoloured through `recolorHighlight`, in order. */
  readonly recoloured: { place: HighlightPlace; color: HighlightColor }[] = [];
  recolorHighlight(place: HighlightPlace, color: HighlightColor) {
    if (!this.places.some((p) => p.page === place.page && sameArea(p.rect, place.rect))) return false;
    this.recoloured.push({ place, color });
    return true;
  }
  removeHighlight(place: HighlightPlace) {
    const index = this.places.findIndex((p) => p.page === place.page && sameArea(p.rect, place.rect));
    if (index < 0) return false;
    this.places.splice(index, 1);
    return true;
  }
  /** Simulate the reader deleting a highlight in the PDF (pdf.js's delete, or undo). */
  deleteHighlightItself(place: HighlightPlace) {
    this.removeHighlight(place);
    this.options.onHighlightRemoved(place);
  }
  /** Undo/redo requests, in order. */
  readonly historyLog: string[] = [];
  undo() {
    this.historyLog.push("undo");
  }
  redo() {
    this.historyLog.push("redo");
  }
  /** Simulate pdf.js reporting what can be undone or redone. */
  reportHistory(canUndo: boolean, canRedo: boolean) {
    this.options.onHistoryChange({ canUndo, canRedo });
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
  /**
   * Simulate the reader finishing a selection (or clearing it, with null): sets what's
   * selected and reports it, with its place on screen, as the adapter's selection watch.
   */
  select(passage: SelectedPassage | null, bounds = { left: 100, top: 300, right: 400, bottom: 316 }) {
    this.selection = passage;
    this.options.onSelectionChange?.(passage ? { passage, bounds } : null);
  }
  /** Whether the app asked for its own selection actions (the popover). */
  get selectionActions() {
    return this.options.selectionActions;
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
  /** The bookmarks this fake PDF reports (set by the factory's `outline`). */
  bookmarks: readonly OutlineItem[] = [];
  outline() {
    return Promise.resolve(this.bookmarks);
  }
  /** Positions jumped to from the contents, in order. */
  readonly jumps: number[] = [];
  goTo(position: number) {
    this.jumps.push(position);
    const page = Math.floor(position);
    this.moveTo({ ...this.current, page: page + 1, pageOffset: position - page });
  }
  /** Passages shown through `revealPassage`, in order. */
  readonly revealed: PassageTarget[] = [];
  revealPassage(target: PassageTarget) {
    this.revealed.push(target);
    this.moveTo({ ...this.current, page: target.page, pageOffset: 0.25 });
  }
  /** The passage outlined now (a quote in the Notes panel is hovered), or null. */
  marked: PassageTarget | null = null;
  markPassage(target: PassageTarget | null) {
    this.marked = target;
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
  /** The bookmarks the next mounts report. */
  outline: readonly OutlineItem[] = [];

  /** Calls to `forget` and the key sets passed to `retain`, in order. */
  readonly forgotten: string[] = [];
  readonly retained: string[][] = [];

  async mount(
    container: HTMLDivElement,
    source: PdfSource,
    options: PdfMountOptions,
  ): Promise<Result<PdfViewerHandle>> {
    const data = await source.load();
    if (!data.ok) return data;
    if (this.failWith) return err(this.failWith);
    container.textContent = "[pdf pages]";
    const handle = new FakePdfHandle(this.info, options, this.highlighting);
    handle.bookmarks = this.outline;
    this.mounts.push(handle);
    return ok(handle);
  }

  forget(key: string) {
    this.forgotten.push(key);
  }

  retain(keys: ReadonlySet<string>) {
    this.retained.push([...keys].sort());
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

/** What the native side says for a file that isn't there (src-tauri/src/lib.rs `read_error`). */
const gone = (path: string) => `'${path.split("/").pop()}' ${MISSING_FILE}`;

export function makeContainer(): TestContainer {
  const picks: (string | null)[] = [];
  const reader: FileReader = {
    async readTextFile(path) {
      const notes = NOTES.get(path);
      if (notes !== undefined) return ok(notes);
      return path in FILES ? ok(FILES[path]) : err(gone(path));
    },
    async readBytes(path, maxBytes) {
      const written = WRITTEN.get(path);
      if (written) return ok(maxBytes === undefined ? written : written.slice(0, maxBytes));
      const text = PDFS[path] ?? FILES[path];
      if (text === undefined) return err(gone(path));
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
    notesService: new NotesService(
      {
        async read(path) {
          const denied = locked(path);
          return denied ? err(denied) : ok(NOTES.get(path) ?? null);
        },
        async write(path, text) {
          const denied = locked(path);
          if (denied) return err(denied);
          NOTES.set(path, text);
          return ok(undefined);
        },
      },
      () => 0.5,
      {
        // Allowing a folder lets the app into it and every folder inside it.
        async allowFolderOf() {
          const folder = FOLDER_PICKS.shift() ?? null;
          if (folder !== null) {
            for (const shut of [...LOCKED]) {
              if (folderHolds(folder, `${shut}/-`)) LOCKED.delete(shut);
            }
          }
          return ok(folder);
        },
      },
    ),
    linkOpener: new FakeLinkOpener(),
    fileWatcher: new TauriFileWatcher(),
    keyCommands: null,
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

/** Press a ⌘-shortcut (⇧⌘ with `shift`). */
export function shortcut(code: string, { shift = false }: { shift?: boolean } = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, metaKey: true, shiftKey: shift, bubbles: true }));
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
    NOTES.clear();
    LOCKED.clear();
    FOLDER_PICKS.length = 0;
    listeners.clear();
  });
  afterEach(async () => {
    await quit();
    vi.unstubAllGlobals();
  });
}
