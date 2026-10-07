import {
  createMarkdownDocument,
  createPdfDocument,
  documentKindForPath,
  fileName,
  hasPdfSignature,
  PDF_HEADER_WINDOW,
  type Document,
} from "../../domain/entities/Document";
import type {
  FilePicker,
  FileReader,
  FileWriter,
} from "../../domain/ports/FileSystem";
import { err, type Result } from "../../domain/values/Result";

/** Result of an open request, modeled as a value so the UI can react to each case. */
export type OpenOutcome =
  | { readonly kind: "opened"; readonly document: Document }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly message: string };

/** Result of a save request. */
export type SaveOutcome =
  | { readonly kind: "saved"; readonly path: string; readonly name: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly message: string };

/**
 * Orchestrates the document lifecycle: open (pick + read), save, and save-as.
 * Depends only on ports, so it is testable with in-memory fakes.
 */
export class DocumentService {
  constructor(
    private readonly picker: FilePicker,
    private readonly reader: FileReader,
    private readonly writer: FileWriter,
  ) {}

  /** Prompt for a file and load it. */
  async open(): Promise<OpenOutcome> {
    const path = await this.picker.pickDocument();
    if (!path) return { kind: "cancelled" };
    return this.load(path);
  }

  /**
   * Load a known path (e.g. from a file association or recent-files list). The extension
   * decides the kind: markdown is read in full; a PDF is only checked — its header is read
   * to confirm it exists and really is a PDF — and the viewer loads the bytes later.
   */
  async load(path: string): Promise<OpenOutcome> {
    if (documentKindForPath(path) === "pdf") {
      const head = await this.reader.readBytes(path, PDF_HEADER_WINDOW);
      if (!head.ok) return { kind: "error", message: head.error };
      if (!hasPdfSignature(head.value)) {
        return { kind: "error", message: `'${fileName(path)}' isn't a valid PDF file.` };
      }
      return { kind: "opened", document: createPdfDocument(path) };
    }
    const result = await this.reader.readTextFile(path);
    if (!result.ok) return { kind: "error", message: result.error };
    return { kind: "opened", document: createMarkdownDocument(path, result.value) };
  }

  /**
   * Read a PDF's bytes for the viewer — the whole file, checked again because it may have
   * changed since the tab was opened.
   */
  async loadPdfData(path: string): Promise<Result<Uint8Array>> {
    const bytes = await this.reader.readBytes(path);
    if (bytes.ok && !hasPdfSignature(bytes.value)) {
      return err(`'${fileName(path)}' isn't a valid PDF file.`);
    }
    return bytes;
  }

  /** Save to the document's path, or prompt for one if it has none. */
  async save(content: string, path: string | null): Promise<SaveOutcome> {
    if (!path) return this.saveAs(content);
    return this.writeTo(path, content);
  }

  /** Always prompt for a path, then write. */
  async saveAs(content: string, suggestedName?: string): Promise<SaveOutcome> {
    const path = await this.picker.pickSavePath(suggestedName);
    if (!path) return { kind: "cancelled" };
    return this.writeTo(path, content);
  }

  private async writeTo(path: string, content: string): Promise<SaveOutcome> {
    const result = await this.writer.writeTextFile(path, content);
    if (!result.ok) return { kind: "error", message: result.error };
    return { kind: "saved", path, name: fileName(path) };
  }
}
