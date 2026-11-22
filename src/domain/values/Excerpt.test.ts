import { describe, expect, it } from "vitest";
import {
  escapeQuoteText,
  excerptHref,
  excerptToMarkdown,
  isExcerptId,
  newExcerptId,
  normalizeExcerptText,
  parseExcerptHref,
  unescapeQuoteText,
  type Excerpt,
} from "./Excerpt";

const excerpt: Excerpt = {
  id: "7f3a9c",
  source: "Geometric Methods.pdf",
  page: 133,
  text: "The exponential map is surjective.",
  color: "blue",
};

describe("excerpt links", () => {
  it("encode the source, page, id and colour, and read back the same", () => {
    const href = excerptHref(excerpt);
    expect(href).toBe("Geometric%20Methods.pdf#page=133&ex=7f3a9c&color=blue");
    expect(parseExcerptHref(href)).toEqual({
      id: "7f3a9c",
      source: "Geometric Methods.pdf",
      page: 133,
      color: "blue",
    });
  });

  it("keep folders and odd characters in the source", () => {
    const link = { ...excerpt, source: "papers/Lie #2 (50%).pdf" };
    expect(parseExcerptHref(excerptHref(link))?.source).toBe("papers/Lie #2 (50%).pdf");
  });

  it("ignore links that aren't excerpts", () => {
    expect(parseExcerptHref("Geometric%20Methods.pdf#page=3")).toBeNull(); // no id
    expect(parseExcerptHref("#page=3&ex=7f3a9c")).toBeNull(); // no source
    expect(parseExcerptHref("a.pdf#page=0&ex=7f3a9c")).toBeNull();
    expect(parseExcerptHref("a.pdf#page=2&ex=NOT-HEX")).toBeNull();
    expect(parseExcerptHref("https://example.com")).toBeNull();
  });

  it("fall back to yellow for an unknown colour", () => {
    expect(parseExcerptHref("a.pdf#page=2&ex=abcd&color=mauve")?.color).toBe("yellow");
  });
});

describe("excerpt ids", () => {
  it("are six hex digits from the given random source", () => {
    const values = [0, 0.99, 0.5, 0.1, 0.25, 0.75];
    let i = 0;
    const id = newExcerptId(() => values[i++]);
    expect(id).toBe("0f814c");
    expect(isExcerptId(id)).toBe(true);
  });
});

describe("excerpt text", () => {
  it("joins lines and hyphen-broken words from a PDF selection", () => {
    expect(normalizeExcerptText("The expo-\nnential map  is\n  surjective. ")).toBe(
      "The exponential map is surjective.",
    );
  });

  it("keeps the hyphen of a name split at a line end", () => {
    expect(normalizeExcerptText("the Baker-\nCampbell formula")).toBe("the Baker-Campbell formula");
  });

  it("escapes Markdown and math syntax, and round-trips", () => {
    const cases = [
      "costs $5 and $6",
      "a *starred* _word_ and `code`",
      "see [12] and <b>",
      "a [link](https://x.y) and [ref][1]",
      "# not a heading",
      "- not a list",
      "1. not a list either",
      "a | b ~ c \\ d",
      "> not a nested quote",
    ];
    for (const text of cases) expect(unescapeQuoteText(escapeQuoteText(text))).toBe(text);
    expect(escapeQuoteText("costs $5")).toBe("costs \\$5");
    expect(escapeQuoteText("1. item")).toBe("1\\. item");
    expect(escapeQuoteText("e.g. this - that")).toBe("e.g. this - that");
    expect(escapeQuoteText("exp : so(n) -> SO(n)")).toBe("exp : so(n) -> SO(n)");
    expect(escapeQuoteText("> quoted")).toBe("\\> quoted");
  });
});

describe("excerptToMarkdown", () => {
  it("is a quote followed by a link to its page", () => {
    expect(excerptToMarkdown(excerpt)).toBe(
      "> The exponential map is surjective.\n" +
        "> — [p. 133](Geometric%20Methods.pdf#page=133&ex=7f3a9c&color=blue)",
    );
  });
});
