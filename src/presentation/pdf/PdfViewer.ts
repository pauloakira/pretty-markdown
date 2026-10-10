import type { HighlightColor } from "../../domain/values/Highlight";
import type { Result } from "../../domain/values/Result";
import type { FindListener, FindTarget } from "../find/FindTarget";
import type { PdfView, PdfZoom } from "../../domain/values/ViewState";

/** Options for mounting a PDF into a container element. */
export interface PdfMountOptions {
  /**
   * Where to open: page, offset within the page, zoom. Asked once the document is ready,
   * so a viewer replacing another (the file changed) opens where that one left off.
   */
  readonly initialView: () => PdfView;
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
  /**
   * The viewer switched tools by itself: the Highlight button next to a selection, or
   * double-clicking a highlight, enters highlight mode. Keeps the toolbar in step.
   */
  readonly onToolChange: (tool: PdfTool) => void;
  /** Whether there are highlight changes to undo or redo (for the toolbar's buttons). */
  readonly onHistoryChange: (history: EditHistory) => void;
}

export interface EditHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
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
  /** The colour for new highlights. (pdf.js's toolbar on a highlight recolours that one.) */
  setHighlightColor(color: HighlightColor): void;
  /** Undo or redo the last highlight change (adding, recolouring, deleting). */
  undo(): void;
  redo(): void;
  /** Search this document from the find bar; results go to `listener`. */
  find(listener: FindListener): FindTarget;
  /** Save any highlights not saved yet, now. Resolves once the save has finished. */
  flush(): Promise<void>;
  /** Release the document, its worker resources and the container's contents. Call
   * `flush()` first: unsaved highlights are lost. */
  destroy(): void;
}

/** A PDF to show: a key (its path) and how to read its bytes when they're needed. */
export interface PdfSource {
  readonly key: string;
  /** Read the file. Not called when the parsed document is still kept from before. */
  load(): Promise<Result<Uint8Array>>;
}

/**
 * Renders PDFs. The presentation layer owns this contract; the pdf.js adapter in
 * infrastructure implements it (loaded on demand) and the composition root provides it,
 * so React never imports pdf.js and tests can use a fake.
 *
 * `container` must be an empty, absolutely positioned element that scrolls.
 *
 * The parsed documents of the few most recently shown PDFs are kept after their viewer is
 * destroyed, so switching back to a tab skips reading and parsing the file
 * (docs/PDF_PLAN.md §5).
 */
export interface PdfViewerFactory {
  mount(
    container: HTMLDivElement,
    source: PdfSource,
    options: PdfMountOptions,
  ): Promise<Result<PdfViewerHandle>>;
  /** Drop the kept document for `key` (its file changed on disk). */
  forget(key: string): void;
  /** Keep documents only for these keys (the PDFs still open in tabs). */
  retain(keys: ReadonlySet<string>): void;
}
