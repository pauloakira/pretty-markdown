import MarkdownIt from "markdown-it";
import type { MacroMap, MathRenderer } from "../../domain/ports/MathRenderer";
import { mathPlugin } from "./mathPlugin";

/**
 * Turns markdown source into HTML, with math delegated to the injected renderer.
 * `html: false` disables raw inline HTML for safety when reading untrusted files;
 * KaTeX/MathJax output is the only HTML we trust into the document.
 *
 * Macros are scoped per `render()` call: each pass starts from a fresh copy of the
 * preamble, so document-wide `\gdef`s persist across that document's formulas but never
 * leak between documents (tabs).
 */
export class MarkdownPipeline {
  private readonly md: MarkdownIt;
  private readonly preamble: MacroMap;
  private activeMacros: MacroMap = {};

  constructor(mathRenderer: MathRenderer, preamble: MacroMap = {}) {
    this.preamble = preamble;
    this.md = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: false,
    });
    this.md.use(mathPlugin, {
      renderer: mathRenderer,
      getMacros: () => this.activeMacros,
    });
  }

  render(source: string): string {
    this.activeMacros = { ...this.preamble };
    return this.md.render(source);
  }
}
