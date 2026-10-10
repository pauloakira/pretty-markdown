import { describe, expect, it } from "vitest";
import { classifyLink, fragmentIds, slugify } from "./Link";

describe("classifyLink", () => {
  it("treats #… as a place in the same document, decoding %-escapes", () => {
    expect(classifyLink("#method")).toEqual({ kind: "fragment", id: "method" });
    expect(classifyLink("#caf%C3%A9")).toEqual({ kind: "fragment", id: "café" });
    expect(classifyLink("#")).toEqual({ kind: "fragment", id: "" });
    expect(classifyLink("#100%")).toEqual({ kind: "fragment", id: "100%" }); // malformed escape
  });

  it("opens web and mail links outside the app", () => {
    for (const url of ["https://arxiv.org/abs/1", "http://example.com", "HTTPS://X.ORG", "mailto:a@b.c"]) {
      expect(classifyLink(url)).toEqual({ kind: "external", url });
    }
  });

  it("leaves everything else as other", () => {
    for (const href of ["./notes.md", "../a/b.md#x", "file:///etc/hosts", "javascript:alert(1)", "tel:123", ""]) {
      expect(classifyLink(href).kind).toBe("other");
    }
  });
});

describe("fragmentIds", () => {
  it("looks for the prefixed heading id first, then the fragment as written", () => {
    expect(fragmentIds("intro")).toEqual(["user-content-intro", "intro"]);
    expect(fragmentIds("user-content-intro")).toEqual(["user-content-intro"]);
  });
});

describe("slugify", () => {
  it("follows GitHub's rules", () => {
    const taken = new Set<string>();
    expect(slugify("Hello, World!", taken)).toBe("hello-world");
    expect(slugify("  Café  au lait ", taken)).toBe("café--au-lait");
    expect(slugify("snake_case & kebab-case", taken)).toBe("snake_case--kebab-case");
  });

  it("numbers repeats", () => {
    const taken = new Set<string>();
    expect(["A", "A", "A"].map((t) => slugify(t, taken))).toEqual(["a", "a-1", "a-2"]);
  });
});
