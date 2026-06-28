import { describe, expect, it } from "vitest";
import type { MacroMap } from "../../domain/ports/MathRenderer";
import { CompositeMathRenderer } from "../math/CompositeMathRenderer";
import { KatexRenderer } from "../math/KatexRenderer";
import { MathJaxRenderer } from "../math/MathJaxRenderer";
import { MarkdownPipeline } from "./MarkdownPipeline";

function makePipeline(preamble: MacroMap = {}): MarkdownPipeline {
  return new MarkdownPipeline(new CompositeMathRenderer([new KatexRenderer()]), preamble);
}

function makeFallbackPipeline(): MarkdownPipeline {
  return new MarkdownPipeline(
    new CompositeMathRenderer([new KatexRenderer(), new MathJaxRenderer()]),
  );
}

describe("MarkdownPipeline", () => {
  it("renders standard markdown", () => {
    const html = makePipeline().render("# Title\n\nHello **world**.");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>world</strong>");
  });

  it("renders inline math via KaTeX", () => {
    const html = makePipeline().render("Mass-energy: $E = mc^2$.");
    expect(html).toContain("katex");
    expect(html).not.toContain("$E = mc^2$");
  });

  it("renders display math as a centered block", () => {
    const html = makePipeline().render("$$\n\\int_0^1 x\\,dx\n$$");
    expect(html).toContain("katex-display");
  });

  it("does not treat currency as math", () => {
    const html = makePipeline().render("It costs $5 and $10 today.");
    expect(html).not.toContain("katex");
    expect(html).toContain("$5 and $10");
  });

  it("shows an error chip instead of breaking on invalid math", () => {
    const html = makePipeline().render("Broken $\\frac{1}{$ math.");
    expect(html).toContain("math-error");
  });

  it("wraps formulas with the source LaTeX in data-tex (copy-as-LaTeX)", () => {
    const html = makePipeline().render("Energy $E = mc^2$ here.");
    expect(html).toContain('class="pm-math"');
    expect(html).toContain('data-tex="E = mc^2"');
  });

  it("escapes special characters in data-tex", () => {
    const html = makePipeline().render("$a < b$");
    expect(html).toContain('data-tex="a &lt; b"');
  });

  it("applies preamble macros", () => {
    const html = makePipeline({ "\\RR": "\\mathbb{R}" }).render("$\\RR$");
    expect(html).toContain("katex"); // rendered, not an error chip
    expect(html).not.toContain("math-error");
  });

  it("falls back to MathJax for constructs KaTeX rejects", () => {
    const html = makeFallbackPipeline().render("$\\enclose{circle}{x}$");
    expect(html).toContain("mjx-container"); // MathJax SVG, not a KaTeX span
    expect(html).not.toContain("math-error");
  });
});
