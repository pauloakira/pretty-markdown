/** What kind of file a document is; decides how it's loaded, shown, and saved. */
export type DocumentKind = "markdown" | "pdf";

/**
 * A markdown document: its text lives in memory and can be edited. Immutable; producing a
 * changed document means creating a new one. `path` is null for documents not yet
 * associated with a file on disk (future: new/unsaved).
 */
export interface MarkdownDocument {
  readonly kind: "markdown";
  readonly path: string | null;
  readonly name: string;
  readonly content: string;
}

/**
 * A PDF, read-only. Its bytes are deliberately not held here — they're large, binary, and
 * never edited — so the viewer loads them by path when the tab is shown.
 */
export interface PdfDocument {
  readonly kind: "pdf";
  readonly path: string;
  readonly name: string;
}

export type Document = MarkdownDocument | PdfDocument;

export function isMarkdown(document: Document): document is MarkdownDocument {
  return document.kind === "markdown";
}

/** Derive a display name from a filesystem path (handles both `/` and `\` separators). */
export function fileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

/** The kind a file is opened as, by extension: `.pdf` is a PDF, anything else markdown. */
export function documentKindForPath(path: string): DocumentKind {
  return /\.pdf$/i.test(path) ? "pdf" : "markdown";
}

export function createMarkdownDocument(path: string, content: string): MarkdownDocument {
  return { kind: "markdown", path, name: fileName(path), content };
}

export function createPdfDocument(path: string): PdfDocument {
  return { kind: "pdf", path, name: fileName(path) };
}

/** How many leading bytes may precede the `%PDF-` header (PDF 1.7 spec, Annex H.3). */
export const PDF_HEADER_WINDOW = 1024;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Whether `bytes` (the start of a file) carry a PDF header within the allowed window. */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, PDF_HEADER_WINDOW) - PDF_MAGIC.length;
  for (let i = 0; i <= end; i += 1) {
    if (PDF_MAGIC.every((b, k) => bytes[i + k] === b)) return true;
  }
  return false;
}
