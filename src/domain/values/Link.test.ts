import { describe, expect, it } from "vitest";
import { classifyLink, fragmentIds, resolveFileLink, slugify } from "./Link";

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

describe("resolveFileLink", () => {
  const notes = "/papers/quad/paper.notes.md";

  it("opens an excerpt's PDF at its page and passage, from the notes file's folder", () => {
    const href = "Geometric%20Methods.pdf#page=133&ex=7f3a9c&color=yellow&rect=72,540,451,553";
    expect(resolveFileLink(href, notes)).toEqual({
      path: "/papers/quad/Geometric Methods.pdf",
      page: 133,
      rect: [72, 540, 451, 553],
    });
  });

  it("opens a plain PDF link at its page, or at the start", () => {
    expect(resolveFileLink("../ref.pdf#page=3", notes)).toEqual({ path: "/papers/ref.pdf", page: 3 });
    expect(resolveFileLink("./ref.PDF", notes)).toEqual({ path: "/papers/quad/ref.PDF" });
    expect(resolveFileLink("ref.pdf#page=0", notes)).toEqual({ path: "/papers/quad/ref.pdf" });
    expect(resolveFileLink("ref.pdf#page=2&rect=nope", notes)).toEqual({ path: "/papers/quad/ref.pdf", page: 2 });
  });

  it("opens other notes and Markdown files, absolute paths included", () => {
    expect(resolveFileLink("other.notes.md#unsorted", notes)).toEqual({ path: "/papers/quad/other.notes.md" });
    expect(resolveFileLink("/Users/me/todo.markdown?x=1", notes)).toEqual({ path: "/Users/me/todo.markdown" });
  });

  it("ignores links with a scheme, fragments, folders and files the app doesn't read", () => {
    for (const href of [
      "file:///etc/hosts.md",
      "javascript:alert(1)//.md",
      "https://x.org/a.pdf",
      "//host/a.pdf",
      "#heading",
      "",
      "pictures/",
      "figure.png",
      "../../../../x.pdf",
      "bad%E0%A4%A.pdf",
    ]) {
      expect(resolveFileLink(href, notes)).toBeNull();
    }
  });
});
