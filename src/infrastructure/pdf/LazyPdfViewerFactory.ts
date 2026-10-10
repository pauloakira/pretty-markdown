import { err, type Result } from "../../domain/values/Result";
import type {
  PdfMountOptions,
  PdfSource,
  PdfViewerFactory,
  PdfViewerHandle,
} from "../../presentation/pdf/PdfViewer";

type PdfJsModule = typeof import("./PdfJsViewer");

/**
 * Loads the pdf.js adapter the first time a PDF is shown, so markdown-only use never
 * downloads or parses pdf.js (it lands in its own chunk). A failed load is retried on the
 * next mount rather than cached.
 */
export class LazyPdfViewerFactory implements PdfViewerFactory {
  private module: Promise<PdfJsModule> | null = null;
  /** Set once pdf.js has loaded; before that, nothing is kept, so nothing to drop. */
  private loaded: PdfJsModule | null = null;

  async mount(
    container: HTMLDivElement,
    source: PdfSource,
    options: PdfMountOptions,
  ): Promise<Result<PdfViewerHandle>> {
    let pdfjs: PdfJsModule;
    try {
      this.module ??= import("./PdfJsViewer");
      pdfjs = await this.module;
      this.loaded = pdfjs;
    } catch (error) {
      this.module = null;
      return err(
        `Couldn't load the PDF viewer: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return pdfjs.mountPdfJs(container, source, options);
  }

  forget(key: string): void {
    this.loaded?.forgetDocument(key);
  }

  retain(keys: ReadonlySet<string>): void {
    this.loaded?.retainDocuments(keys);
  }
}
