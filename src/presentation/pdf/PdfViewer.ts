import type { Result } from "../../domain/values/Result";
import type { PdfView, PdfZoom } from "../../domain/values/ViewState";

/** Options for mounting a PDF into a container element. */
export interface PdfMountOptions {
  /** Where to open: page, offset within the page, zoom. */
  readonly initialView: PdfView;
  /** Called as the reader scrolls or zooms (often — callers should debounce persistence). */
  readonly onViewChange: (view: PdfView) => void;
  /** Called when a link to outside the document is clicked (open it in the browser). */
  readonly onExternalLink: (url: string) => void;
}

/** What the mounted document reports about itself. */
export interface PdfInfo {
  readonly pageCount: number;
  /** The title from the PDF's metadata, if it has one. */
  readonly title: string | null;
}

/** A PDF shown in a container: controls for the toolbar and keyboard, plus teardown. */
export interface PdfViewerHandle {
  readonly info: PdfInfo;
  /** Where the reader is now. */
  view(): PdfView;
  /** The scale actually in effect (resolves "page-width" to a number). */
  currentScale(): number;
  setZoom(zoom: PdfZoom): void;
  goToPage(page: number): void;
  /** Release the document, its worker resources and the container's contents. */
  destroy(): void;
}

/**
 * Renders PDFs. The presentation layer owns this contract; the pdf.js adapter in
 * infrastructure implements it (loaded on demand) and the composition root provides it,
 * so React never imports pdf.js and tests can use a fake.
 *
 * `container` must be an empty, absolutely positioned element that scrolls.
 */
export interface PdfViewerFactory {
  mount(
    container: HTMLDivElement,
    data: Uint8Array,
    options: PdfMountOptions,
  ): Promise<Result<PdfViewerHandle>>;
}
