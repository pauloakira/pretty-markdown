import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import type { MathDocument } from "mathjax-full/js/core/MathDocument.js";
import type { LiteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import type { LiteDocument } from "mathjax-full/js/adaptors/lite/Document.js";
import type { LiteElement } from "mathjax-full/js/adaptors/lite/Element.js";
import type { LiteText } from "mathjax-full/js/adaptors/lite/Text.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import type { MacroMap, MathRenderer, MathRenderOptions } from "../../domain/ports/MathRenderer";
import { rendered, renderFailed, type RenderResult } from "../../domain/values/RenderResult";

/** The HTML handler is global to MathJax and must only be registered once per process. */
let adaptor: LiteAdaptor | null = null;
function sharedAdaptor(): LiteAdaptor {
  if (!adaptor) {
    adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
  }
  return adaptor;
}

/**
 * Fallback math renderer: full MathJax (all TeX packages) with SVG output, so each
 * formula is self-contained (no font CSS needed). Slower and heavier than KaTeX, used
 * only when KaTeX rejects an expression. Output is synchronous via the lite adaptor.
 *
 * `formatError` is wired to throw, so a parse failure becomes a failure value (for the
 * error chip) instead of MathJax's default inline `merror` markup.
 */
export class MathJaxRenderer implements MathRenderer {
  private readonly adaptor: LiteAdaptor;
  private readonly doc: MathDocument<LiteElement, LiteText, LiteDocument>;

  constructor(preamble: MacroMap = {}) {
    this.adaptor = sharedAdaptor();
    const input = new TeX({
      packages: AllPackages,
      macros: preamble,
      formatError: (_jax: unknown, error: unknown): never => {
        throw error;
      },
    });
    const output = new SVG({ fontCache: "local" });
    this.doc = mathjax.document("", { InputJax: input, OutputJax: output });
  }

  render(tex: string, opts: MathRenderOptions): RenderResult {
    try {
      // With SVG output + the lite adaptor, convert yields a LiteElement (the typed
      // union also admits MmlNode, which only occurs for other output jaxes).
      const node = this.doc.convert(tex, { display: opts.display }) as LiteElement;
      return rendered(this.adaptor.outerHTML(node));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return renderFailed(tex, message);
    }
  }
}
