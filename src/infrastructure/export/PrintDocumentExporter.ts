import type { DocumentExporter, ExportInput } from "../../domain/ports/DocumentExporter";

/**
 * Exports to PDF via the webview's print → "Save as PDF". The rendered HTML is injected
 * into a `#print-root` that the print stylesheet shows in place of the app UI, so the
 * output is the document alone. KaTeX (fonts) and MathJax (SVG) print as vector, giving a
 * crisp, selectable PDF.
 *
 * The print root is removed after printing finishes (afterprint), with a timeout fallback
 * for webviews that don't fire the event.
 *
 * `print` starts printing: the webview's `window.print()` by default. WKWebView on iPadOS
 * ignores that, so there it asks the system print sheet (which can also save or share the
 * PDF) and resolves when the sheet closes.
 */
export class PrintDocumentExporter implements DocumentExporter {
  constructor(private readonly print: (title: string) => void | Promise<void> = () => window.print()) {}

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
      // A print that resolves (the iPad's sheet) is over when it does.
      const done = this.print(title);
      if (done) await done.finally(cleanup);
    } catch {
      cleanup();
    }
  }
}
