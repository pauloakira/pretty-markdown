import { invoke } from "@tauri-apps/api/core";
import type { FileWatcher } from "../domain/ports/FileWatcher";
import { TauriFileWatcher } from "../infrastructure/fs/TauriFileWatcher";
import { DocumentService } from "../application/services/DocumentService";
import { NotesService } from "../application/services/NotesService";
import { PdfSaver } from "../application/services/PdfSaver";
import { SessionService } from "../application/services/SessionService";
import { TabManager } from "../application/services/TabManager";
import type { AppWindow } from "../domain/ports/AppWindow";
import type { DocumentExporter } from "../domain/ports/DocumentExporter";
import type { LinkOpener } from "../domain/ports/LinkOpener";
import type { MacroMap } from "../domain/ports/MathRenderer";
import type { RecentFilesRepository } from "../domain/ports/RecentFilesRepository";
import type { SettingsRepository } from "../domain/ports/SettingsRepository";
import { IosFileSystem } from "../infrastructure/fs/IosFileSystem";
import { TauriFileSystem } from "../infrastructure/fs/TauriFileSystem";
import { TauriFolderAccess } from "../infrastructure/fs/TauriFolderAccess";
import { TauriNotesStore } from "../infrastructure/fs/TauriNotesStore";
import { PrintDocumentExporter } from "../infrastructure/export/PrintDocumentExporter";
import { CompositeMathRenderer } from "../infrastructure/math/CompositeMathRenderer";
import { KatexRenderer } from "../infrastructure/math/KatexRenderer";
import { MathJaxRenderer } from "../infrastructure/math/MathJaxRenderer";
import { MarkdownPipeline } from "../infrastructure/markdown/MarkdownPipeline";
import { LocalStorageRecentFilesRepository } from "../infrastructure/persistence/LocalStorageRecentFilesRepository";
import { LocalStorageKeptNotes } from "../infrastructure/persistence/LocalStorageKeptNotes";
import { LocalStorageSettingsRepository } from "../infrastructure/persistence/LocalStorageSettingsRepository";
import { TauriSessionRepository } from "../infrastructure/persistence/TauriSessionRepository";
import { LazyPdfViewerFactory } from "../infrastructure/pdf/LazyPdfViewerFactory";
import { TauriAppWindow } from "../infrastructure/shell/TauriAppWindow";
import { TauriLinkOpener } from "../infrastructure/shell/TauriLinkOpener";
import type { PdfViewerFactory } from "../presentation/pdf/PdfViewer";
import type { HardwareKeyCommands } from "../presentation/keyboard/HardwareKeyCommands";
import { TauriKeyCommands } from "../infrastructure/keyboard/TauriKeyCommands";

/**
 * Default math preamble — custom macros available in every document, fed to both
 * renderers. Authors can also define document-wide macros inline with `\gdef`.
 * (A settings UI / front-matter source for this is a later milestone.)
 */
const DEFAULT_PREAMBLE: MacroMap = {};

/**
 * Composition root: the one place where concrete adapters are wired into services.
 * Everything else depends on interfaces, not implementations (ARCHITECTURE.md §1).
 */
export interface Container {
  readonly documentService: DocumentService;
  readonly pipeline: MarkdownPipeline;
  readonly tabManager: TabManager;
  readonly settingsRepository: SettingsRepository;
  readonly recentFilesRepository: RecentFilesRepository;
  readonly sessionService: SessionService;
  readonly appWindow: AppWindow;
  readonly documentExporter: DocumentExporter;
  /** Renders PDF tabs; pdf.js itself loads on first use. */
  readonly pdfViewer: PdfViewerFactory;
  /** Saves PDFs (e.g. with new highlights) and recognises those saves when watching. */
  readonly pdfSaver: PdfSaver;
  /** Keeps excerpts in each document's notes file (docs/RESEARCH_READER.md). */
  readonly notesService: NotesService;
  readonly linkOpener: LinkOpener;
  /** Tells about files changed on disk (open documents, notes files). */
  readonly fileWatcher: FileWatcher;
  /**
   * The shortcuts as system key commands, where the system keeps hardware keys from the
   * page (iPadOS); null where the page gets them.
   */
  readonly keyCommands: HardwareKeyCommands | null;
}

export function createContainer(): Container {
  // KaTeX first (fast, sync), MathJax as the fallback for what KaTeX rejects.
  const mathRenderer = new CompositeMathRenderer([
    new KatexRenderer(),
    new MathJaxRenderer(DEFAULT_PREAMBLE),
  ]);
  const pipeline = new MarkdownPipeline(mathRenderer, DEFAULT_PREAMBLE);

  // iPadOS opens files in place through security-scoped bookmarks; desktop uses paths.
  const fileSystem =
    import.meta.env.TAURI_ENV_PLATFORM === "ios" ? new IosFileSystem() : new TauriFileSystem();
  const documentService = new DocumentService(fileSystem, fileSystem, fileSystem);
  const tabManager = new TabManager();
  const settingsRepository = new LocalStorageSettingsRepository();
  const recentFilesRepository = new LocalStorageRecentFilesRepository();
  const sessionService = new SessionService(new TauriSessionRepository(), documentService);
  const appWindow = new TauriAppWindow();
  const documentExporter =
    import.meta.env.TAURI_ENV_PLATFORM === "ios"
      ? new PrintDocumentExporter((title) => invoke("print_page", { title }))
      : new PrintDocumentExporter();
  const pdfViewer = new LazyPdfViewerFactory();
  const pdfSaver = new PdfSaver(fileSystem, fileSystem);
  // iPadOS: notes beside a PDF need its folder allowed first (the PDF alone was given).
  const notesService = new NotesService(
    new TauriNotesStore(),
    Math.random,
    import.meta.env.TAURI_ENV_PLATFORM === "ios" ? new TauriFolderAccess() : null,
    new LocalStorageKeptNotes(),
  );
  const linkOpener = new TauriLinkOpener();
  const fileWatcher = new TauriFileWatcher();

  return {
    documentService,
    pipeline,
    tabManager,
    settingsRepository,
    recentFilesRepository,
    sessionService,
    appWindow,
    documentExporter,
    pdfViewer,
    pdfSaver,
    notesService,
    linkOpener,
    fileWatcher,
    keyCommands: import.meta.env.TAURI_ENV_PLATFORM === "ios" ? new TauriKeyCommands() : null,
  };
}
