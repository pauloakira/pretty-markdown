import { createDocument, type Document } from "../../domain/entities/Document";
import type { FilePicker, FileReader } from "../../domain/ports/FileSystem";

/** Result of an open request, modeled as a value so the UI can react to each case. */
export type OpenOutcome =
  | { readonly kind: "opened"; readonly document: Document }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly message: string };

/**
 * Orchestrates the document lifecycle: pick a file, read it, build a Document.
 * Depends only on ports, so it is testable with in-memory fakes.
 */
export class DocumentService {
  constructor(
    private readonly picker: FilePicker,
    private readonly reader: FileReader,
  ) {}

  /** Prompt for a file and load it. */
  async open(): Promise<OpenOutcome> {
    const path = await this.picker.pickMarkdownFile();
    if (!path) return { kind: "cancelled" };
    return this.load(path);
  }

  /** Load a known path (e.g. from a file association or recent-files list). */
  async load(path: string): Promise<OpenOutcome> {
    const result = await this.reader.readTextFile(path);
    if (!result.ok) return { kind: "error", message: result.error };
    return { kind: "opened", document: createDocument(path, result.value) };
  }
}
