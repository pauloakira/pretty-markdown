import { describe, expect, it } from "vitest";
import type { MacroMap } from "../../domain/ports/MathRenderer";
import { CompositeMathRenderer } from "../math/CompositeMathRenderer";
import { KatexRenderer } from "../math/KatexRenderer";
import { MathJaxRenderer } from "../math/MathJaxRenderer";
import { MarkdownPipeline } from "./MarkdownPipeline";
import { excerptToMarkdown } from "../../domain/values/Excerpt";

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
    expect(html).toContain('<h1 id="user-content-title">Title</h1>');
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

describe("MarkdownPipeline — LaTeX-style delimiters", () => {
  it("renders \\(...\\) inline math instead of escaping the backslash", () => {
    const html = makePipeline().render("A beam of length \\(L\\) is clamped.");
    expect(html).toContain("katex");
    // The old behaviour leaked the source as a literal "(L)".
    expect(html).not.toContain("(L)");
    expect(html).toContain('data-tex="L"');
  });

  it("renders \\[...\\] as display math", () => {
    const html = makePipeline().render("\\[\nE = mc^2\n\\]");
    expect(html).toContain("katex-display");
    expect(html).not.toContain("\\[");
  });

  it("handles \\(...\\) inside table cells", () => {
    const html = makePipeline().render(
      ["| \\(n_{\\mathrm{el}}\\) | \\(k=3\\) |", "|---|---|", "| 1 | 4 |"].join("\n"),
    );
    expect(html).toContain("<table>");
    // Rendered inside the header cell, not leaked as literal text.
    expect(html).toContain('<th><span class="pm-math"');
    expect(html).toContain('data-tex="n_{\\mathrm{el}}"');
  });

  it("still escapes an unclosed \\( to a literal paren", () => {
    const html = makePipeline().render("cost \\(approx");
    expect(html).toContain("(approx");
    expect(html).not.toContain("katex");
  });

  it("keeps $...$ and \\(...\\) working in the same document", () => {
    const html = makePipeline().render("Both $a$ and \\(b\\) render.");
    expect((html.match(/class="pm-math"/g) ?? []).length).toBe(2);
  });

  it("gives headings GitHub-style ids for in-document links", () => {
    const html = makePipeline().render(
      "# Getting Started\n\n## The `render()` call — notes!\n\n## Getting Started\n\n## Proof of $\\alpha$",
    );
    expect(html).toContain('<h1 id="user-content-getting-started">');
    expect(html).toContain('<h2 id="user-content-the-render-call--notes">');
    expect(html).toContain('<h2 id="user-content-getting-started-1">'); // repeat gets a suffix
    expect(html).toContain('<h2 id="user-content-proof-of">'); // math left out of the slug
  });

  it("starts heading ids afresh for each document", () => {
    const pipeline = makePipeline();
    pipeline.render("# Intro");
    expect(pipeline.render("# Intro")).toContain('id="user-content-intro"');
  });

  it("renders an excerpt quote as written: no math, emphasis or list from its text", () => {
    const quote = excerptToMarkdown({
      id: "7f3a9c",
      source: "Geometric Methods.pdf",
      page: 133,
      text: "1. Costs $5 and $10; a *star* and x_1 [12], not [a link](x.pdf).",
      color: "blue",
    });
    const html = makePipeline().render(quote);
    expect(html).toContain('<blockquote class="excerpt excerpt--blue"');
    expect(html).not.toContain("katex");
    expect(html).not.toContain("<em>");
    expect(html).not.toContain("<ol>");
    expect(html).toContain("1. Costs $5 and $10; a *star* and x_1 [12], not [a link](x.pdf).");
    expect(html).toContain('href="Geometric%20Methods.pdf#page=133&amp;ex=7f3a9c&amp;color=blue"');
  });
});

describe("excerpt blocks", () => {
  const excerpt = (text: string, extra: Partial<Parameters<typeof excerptToMarkdown>[0]> = {}) =>
    excerptToMarkdown({
      id: "7f3a9c",
      source: "Geometric Methods.pdf",
      page: 133,
      text,
      color: "yellow",
      rect: [72, 540, 451, 553],
      ...extra,
    });

  it("renders an excerpt as a quote with its colour and a link back to its page", () => {
    const html = makePipeline().render(excerpt("The exponential map is surjective."));
    expect(html).toBe(
      '<blockquote class="excerpt excerpt--yellow" data-excerpt="7f3a9c" ' +
        'data-source="Geometric Methods.pdf" data-page="133">\n' +
        "<p>The exponential map is surjective.</p>\n" +
        '<p class="excerpt__source"><a href="Geometric%20Methods.pdf#page=133&amp;ex=7f3a9c&amp;color=yellow&amp;rect=72,540,451,553" class="excerpt__link">' +
        '<span aria-hidden="true">↗ </span>p. 133 · Geometric Methods</a></p>\n' +
        "</blockquote>\n",
    );
  });

  it("keeps the reader's own wording of the link, and names a document in a folder", () => {
    const md = "> Quoted.\n> — [Theorem 4.8](papers/Lie%20Groups.pdf#page=87&ex=c41d2e&color=green)";
    const html = makePipeline().render(md);
    expect(html).toContain('class="excerpt excerpt--green"');
    expect(html).toContain('data-source="papers/Lie Groups.pdf"');
    expect(html).toContain("</span>Theorem 4.8 · Lie Groups</a>");
  });

  it("leaves ordinary quotes alone, including ones ending in a plain page link", () => {
    const pipeline = makePipeline();
    expect(pipeline.render("> Just a quote.")).toBe("<blockquote>\n<p>Just a quote.</p>\n</blockquote>\n");
    const plainLink = pipeline.render("> Quoted.\n> — [p. 3](paper.pdf#page=3)");
    expect(plainLink).toContain("<blockquote>");
    expect(plainLink).toContain("— <a href=\"paper.pdf#page=3\">p. 3</a>");
  });

  it("needs the link on a line of its own after a dash", () => {
    const pipeline = makePipeline();
    const href = "a.pdf#page=2&ex=7f3a9c&color=pink";
    expect(pipeline.render(`> Read [p. 2](${href}) for more.`)).toContain("<blockquote>");
    expect(pipeline.render(`> Inline — [p. 2](${href})`)).toContain("<blockquote>");
    expect(pipeline.render(`> Text\n> [p. 2](${href})`)).toContain("<blockquote>");
    expect(pipeline.render(`> Text\n> — [p. 2](${href}) and more`)).toContain("<blockquote>");
  });

  it("keeps a quote the reader spread over several lines and paragraphs", () => {
    const href = "a.pdf#page=2&ex=7f3a9c&color=pink";
    const html = makePipeline().render(`> First paragraph.\n>\n> Second, *edited*\n> over two lines.\n>\n> — [p. 2](${href})`);
    expect(html).toContain('class="excerpt excerpt--pink"');
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second, <em>edited</em>\nover two lines.</p>");
    expect(html).not.toMatch(/<p>\s*<\/p>/); // the source line's own paragraph is gone
    expect(html.match(/<p/g)).toHaveLength(3);
  });

  it("escapes what comes from the link", () => {
    const html = makePipeline().render('> Q.\n> — [p. 1](%3Cimg%20src%3Dx%20onerror%3D%22a%22%3E.pdf#page=1&ex=7f3a9c)');
    expect(html).not.toContain("<img");
    expect(html).toContain('data-source="&lt;img src=x onerror=&quot;a&quot;&gt;.pdf"');
    expect(html).toContain("· &lt;img src=x onerror=&quot;a&quot;&gt;</a>");
  });

  it("renders math between excerpts, and still falls back to MathJax", () => {
    const notes = [
      excerpt("Costs $5."),
      "So $e^{tA} \\in SO(n)$ and $\\enclose{circle}{x}$.",
      excerpt("The second one.", { id: "c41d2e", color: "blue" }),
    ].join("\n\n");
    const html = makeFallbackPipeline().render(notes);
    expect(html.match(/class="excerpt /g)).toHaveLength(2);
    expect(html).toContain("<p>Costs $5.</p>"); // the quote's $ stays text
    expect(html).toContain("katex");
    expect(html).toContain("mjx-container");
  });

  it("finds an excerpt inside a list or a nested quote", () => {
    const href = "a.pdf#page=2&ex=7f3a9c&color=blue";
    const html = makePipeline().render(`- Item\n\n  > Q.\n  > — [p. 2](${href})\n\n> Outer\n>\n> > Inner.\n> > — [p. 2](${href})`);
    expect(html.match(/class="excerpt excerpt--blue"/g)).toHaveLength(2);
    expect(html).toContain("<blockquote>\n<p>Outer</p>"); // the outer quote isn't one
  });
});
