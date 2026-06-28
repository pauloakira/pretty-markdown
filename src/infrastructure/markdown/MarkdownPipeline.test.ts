import { describe, expect, it } from "vitest";
import { CompositeMathRenderer } from "../math/CompositeMathRenderer";
import { KatexRenderer } from "../math/KatexRenderer";
import { MarkdownPipeline } from "./MarkdownPipeline";

function makePipeline(): MarkdownPipeline {
  return new MarkdownPipeline(new CompositeMathRenderer([new KatexRenderer()]));
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
});
