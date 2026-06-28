import type { MathRenderer, MathRenderOptions } from "../../domain/ports/MathRenderer";
import { renderFailed, type RenderResult } from "../../domain/values/RenderResult";

/**
 * Tries each renderer in order until one succeeds (Composite / Chain of Responsibility).
 * This is where the KaTeX → MathJax fallback lives: pass `[katex, mathjax]`.
 * If all fail, returns the last failure so the caller can show an error chip.
 */
export class CompositeMathRenderer implements MathRenderer {
  constructor(private readonly renderers: readonly MathRenderer[]) {}

  render(tex: string, opts: MathRenderOptions): RenderResult {
    let last: RenderResult = renderFailed(tex, "no math renderer configured");
    for (const renderer of this.renderers) {
      last = renderer.render(tex, opts);
      if (last.ok) return last;
    }
    return last;
  }
}
