import katex from "katex";
import type { MathRenderer, MathRenderOptions } from "../../domain/ports/MathRenderer";
import { rendered, renderFailed, type RenderResult } from "../../domain/values/RenderResult";

/**
 * Primary math renderer. Fast and synchronous — covers the large majority of math.
 * On a parse error it returns a failure value so a fallback renderer (MathJax, M2)
 * can try next, rather than throwing.
 */
export class KatexRenderer implements MathRenderer {
  render(tex: string, opts: MathRenderOptions): RenderResult {
    try {
      const html = katex.renderToString(tex, {
        displayMode: opts.display,
        throwOnError: true,
        // `strict: false` keeps KaTeX permissive (e.g. unknown Unicode) instead of
        // erroring; genuine parse failures still throw and trigger the fallback.
        strict: false,
      });
      return rendered(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return renderFailed(tex, message);
    }
  }
}
