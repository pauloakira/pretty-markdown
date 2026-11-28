import { describe, expect, it } from "vitest";
import { classifyLink, fragmentIds, rebaseLinks, relativePath, resolveFileLink, resolvePath, slugify } from "./Link";

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

describe("relativePath and resolvePath", () => {
  it("link a notes file to its PDF and back", () => {
    expect(relativePath("/p/Notes/a.notes.md", "/p/a.pdf")).toBe("../a.pdf");
    expect(relativePath("/p/a.notes.md", "/p/a.pdf")).toBe("a.pdf");
    expect(relativePath("/n/x.notes.md", "/p/q/a.pdf")).toBe("../p/q/a.pdf");
    expect(resolvePath("../a.pdf", "/p/Notes/a.notes.md")).toBe("/p/a.pdf");
    expect(resolvePath("a.pdf", "/p/a.notes.md")).toBe("/p/a.pdf");
    expect(resolvePath("../../../a.pdf", "/p/a.notes.md")).toBeNull();
  });
});

describe("rebaseLinks", () => {
  const from = "/papers/Geometric Methods.notes.md";
  const to = "/papers/Notes/Geometric Methods.notes.md";
  const moved = (markdown: string) => rebaseLinks(markdown, from, to);

  it("points relative links and images at the same files from the new place", () => {
    expect(moved("> Lemma.\n> — [p. 3](Geometric%20Methods.pdf#page=3&ex=abcdef&color=yellow)\n")).toBe(
      "> Lemma.\n> — [p. 3](../Geometric%20Methods.pdf#page=3&ex=abcdef&color=yellow)\n",
    );
    expect(moved("See ![fig](figs/a.png \"A\") and [b](<my notes.md>).")).toBe(
      "See ![fig](../figs/a.png \"A\") and [b](<../my notes.md>).",
    );
    expect(moved("[x](Notes/other.md) [y](f(1).md)")).toBe("[x](other.md) [y](../f%281%29.md)");
  });

  it("rewrites reference definitions and HTML, and nothing else", () => {
    expect(moved("[ref]: figs/b.png\n<img src=\"c.png\"> <a href='d.md'>d</a>\n")).toBe(
      "[ref]: ../figs/b.png\n<img src=\"../c.png\"> <a href='../d.md'>d</a>\n",
    );
    const kept = "[web](https://x.org/a) [top](#intro) [abs](/etc/a.md) [mail](mailto:a@b.c)\n";
    expect(moved(kept)).toBe(kept);
  });

  it("leaves code as written", () => {
    const code = "```md\n[a](a.md)\n```\nUse `[b](b.md)` or [c](c.md).\n~~~\n![](d.png)\n~~~\n";
    expect(moved(code)).toBe("```md\n[a](a.md)\n```\nUse `[b](b.md)` or [c](../c.md).\n~~~\n![](d.png)\n~~~\n");
  });

  it("keeps Windows line endings", () => {
    expect(moved("[a](a.md)\r\n[b](b.md)\r\n")).toBe("[a](../a.md)\r\n[b](../b.md)\r\n");
  });
});
