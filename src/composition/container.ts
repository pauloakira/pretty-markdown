import { DocumentService } from "../application/services/DocumentService";
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
import { PrintDocumentExporter } from "../infrastructure/export/PrintDocumentExporter";
import { CompositeMathRenderer } from "../infrastructure/math/CompositeMathRenderer";
import { KatexRenderer } from "../infrastructure/math/KatexRenderer";
import { MathJaxRenderer } from "../infrastructure/math/MathJaxRenderer";
import { MarkdownPipeline } from "../infrastructure/markdown/MarkdownPipeline";
import { LocalStorageRecentFilesRepository } from "../infrastructure/persistence/LocalStorageRecentFilesRepository";
import { LocalStorageSettingsRepository } from "../infrastructure/persistence/LocalStorageSettingsRepository";
import { TauriSessionRepository } from "../infrastructure/persistence/TauriSessionRepository";
import { LazyPdfViewerFactory } from "../infrastructure/pdf/LazyPdfViewerFactory";
import { TauriAppWindow } from "../infrastructure/shell/TauriAppWindow";
import { TauriLinkOpener } from "../infrastructure/shell/TauriLinkOpener";
import type { PdfViewerFactory } from "../presentation/pdf/PdfViewer";

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
  readonly linkOpener: LinkOpener;
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
  const documentExporter = new PrintDocumentExporter();
  const pdfViewer = new LazyPdfViewerFactory();
  const pdfSaver = new PdfSaver(fileSystem);
  const linkOpener = new TauriLinkOpener();

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
    linkOpener,
  };
}
