import type { DocumentExporter, ExportInput } from "../../domain/ports/DocumentExporter";

/**
 * Exports to PDF via the webview's print → "Save as PDF". The rendered HTML is injected
 * into a `#print-root` that the print stylesheet shows in place of the app UI, so the
 * output is the document alone. KaTeX (fonts) and MathJax (SVG) print as vector, giving a
 * crisp, selectable PDF.
 *
 * The print root is removed after printing finishes (afterprint), with a timeout fallback
 * for webviews that don't fire the event.
 */
export class PrintDocumentExporter implements DocumentExporter {
  async exportPdf({ title, html }: ExportInput): Promise<void> {
    document.getElementById("print-root")?.remove();

    const root = document.createElement("div");
    root.id = "print-root";
    root.innerHTML = `<article class="reader markdown-body">${html}</article>`;
    document.body.appendChild(root);

    const previousTitle = document.title;
    document.title = title;

    let fallback = 0;
    const cleanup = () => {
      window.removeEventListener("afterprint", cleanup);
      if (fallback) window.clearTimeout(fallback);
      document.title = previousTitle;
      root.remove();
    };
    window.addEventListener("afterprint", cleanup);
    fallback = window.setTimeout(cleanup, 60_000);

    try {
      window.print();
    } catch {
      cleanup();
    }
  }
}
