export interface ExportInput {
  /** Used as the print/PDF document title (and default filename). */
  readonly title: string;
  /** Rendered document HTML (from the markdown pipeline). */
  readonly html: string;
}

/** Port: export a rendered document (e.g. to PDF). */
export interface DocumentExporter {
  exportPdf(input: ExportInput): Promise<void>;
}
