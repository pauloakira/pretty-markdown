import { describe, expect, it } from "vitest";
import { MathJaxRenderer } from "./MathJaxRenderer";

describe("MathJaxRenderer", () => {
  const renderer = new MathJaxRenderer();

  it("renders valid math to SVG output", () => {
    const result = renderer.render("x^2 + y^2", { display: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain("<mjx-container");
      expect(result.html).toContain("<svg");
    }
  });

  it("renders constructs KaTeX lacks, e.g. \\enclose", () => {
    const result = renderer.render("\\enclose{circle}{x}", { display: false });
    expect(result.ok).toBe(true);
  });

  it("returns a failure value on invalid math", () => {
    const result = renderer.render("\\frac{1}{", { display: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.source).toBe("\\frac{1}{");
  });

  it("applies preamble macros", () => {
    const withMacro = new MathJaxRenderer({ "\\RR": "\\mathbb{R}" });
    const result = withMacro.render("\\RR", { display: false });
    expect(result.ok).toBe(true);
  });
});
