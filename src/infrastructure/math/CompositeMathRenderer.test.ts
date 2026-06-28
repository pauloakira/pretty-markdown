import { describe, expect, it, vi } from "vitest";
import type { MathRenderer } from "../../domain/ports/MathRenderer";
import { rendered, renderFailed, type RenderResult } from "../../domain/values/RenderResult";
import { CompositeMathRenderer } from "./CompositeMathRenderer";

const ok = (html: string): MathRenderer => ({ render: () => rendered(html) });
const fail = (msg: string): MathRenderer => ({ render: (tex) => renderFailed(tex, msg) });

describe("CompositeMathRenderer", () => {
  it("returns the first successful result and stops", () => {
    const second = { render: vi.fn(() => rendered("<b>second</b>")) };
    const third = { render: vi.fn<() => RenderResult>(() => rendered("<i>third</i>")) };
    const composite = new CompositeMathRenderer([fail("nope"), second, third]);

    const result = composite.render("x", { display: false });
    expect(result.ok && result.html).toBe("<b>second</b>");
    expect(second.render).toHaveBeenCalledTimes(1);
    expect(third.render).not.toHaveBeenCalled(); // short-circuits after success
  });

  it("falls through to the last renderer", () => {
    const composite = new CompositeMathRenderer([fail("a"), fail("b"), ok("<svg/>")]);
    const result = composite.render("x", { display: false });
    expect(result.ok && result.html).toBe("<svg/>");
  });

  it("returns the last failure when every renderer fails", () => {
    const composite = new CompositeMathRenderer([fail("a"), fail("b")]);
    const result = composite.render("x", { display: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("b");
  });

  it("fails cleanly with no renderers configured", () => {
    const result = new CompositeMathRenderer([]).render("x", { display: false });
    expect(result.ok).toBe(false);
  });
});
