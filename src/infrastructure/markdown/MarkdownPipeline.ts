import MarkdownIt from "markdown-it";
import type { MathRenderer } from "../../domain/ports/MathRenderer";
import { mathPlugin } from "./mathPlugin";

/**
 * Turns markdown source into HTML, with math delegated to the injected renderer.
 * `html: false` disables raw inline HTML for safety when reading untrusted files;
 * KaTeX output is the only HTML we trust into the document.
 */
export class MarkdownPipeline {
  private readonly md: MarkdownIt;

  constructor(mathRenderer: MathRenderer) {
    this.md = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: false,
    });
    this.md.use(mathPlugin, { renderer: mathRenderer });
  }

  render(source: string): string {
    return this.md.render(source);
  }
}
