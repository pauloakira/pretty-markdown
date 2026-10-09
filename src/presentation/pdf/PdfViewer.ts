import type { HighlightColor } from "../../domain/values/Highlight";
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
  /** The highlighter's colour to start with. */
  readonly highlightColor: HighlightColor;
  /**
   * Write the document, with the reader's highlights, back to its file. Called by the
   * viewer's autosave shortly after each change, and by `flush()`. A failure keeps the
   * changes pending, to be retried with the next change or flush.
   */
  readonly onSave: (bytes: Uint8Array) => Promise<Result<void>>;
}

/**
 * What a pointer does over the pages. "select" selects text (and offers a Highlight
 * button next to a selection); "highlight" highlights every selection straight away.
 */
export type PdfTool = "select" | "highlight";

/** Whether this document can be highlighted, and if not, why (for the toolbar tooltip). */
export type HighlightAvailability =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

/** What the mounted document reports about itself. */
export interface PdfInfo {
  readonly pageCount: number;
  /** The title from the PDF's metadata, if it has one. */
  readonly title: string | null;
}

/** A PDF shown in a container: controls for the toolbar and keyboard, plus teardown. */
export interface PdfViewerHandle {
  readonly info: PdfInfo;
  readonly highlighting: HighlightAvailability;
  /** Where the reader is now. */
  view(): PdfView;
  /** The scale actually in effect (resolves "page-width" to a number). */
  currentScale(): number;
  setZoom(zoom: PdfZoom): void;
  goToPage(page: number): void;
  setTool(tool: PdfTool): void;
  /** The colour for new highlights; also recolours a highlight that is selected. */
  setHighlightColor(color: HighlightColor): void;
  /** Save any highlights not saved yet, now. Resolves once the save has finished. */
  flush(): Promise<void>;
  /** Release the document, its worker resources and the container's contents. Call
   * `flush()` first: unsaved highlights are lost. */
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
