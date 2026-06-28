import { describe, expect, it } from "vitest";
import { KatexRenderer } from "./KatexRenderer";

describe("KatexRenderer", () => {
  const renderer = new KatexRenderer();

  it("renders valid inline math to KaTeX HTML", () => {
    const result = renderer.render("E = mc^2", { display: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.html).toContain("katex");
  });

  it("renders display math with displayMode markup", () => {
    const result = renderer.render("\\int_0^1 x\\,dx", { display: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.html).toContain("katex-display");
  });

  it("returns a failure value (not a throw) on invalid math", () => {
    const result = renderer.render("\\frac{1}{", { display: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.source).toBe("\\frac{1}{");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
