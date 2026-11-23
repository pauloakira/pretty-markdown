import { describe, expect, it } from "vitest";
import type { Excerpt } from "./Excerpt";
import {
  addExcerpt,
  isNotesPath,
  newNotesFile,
  notesPathFor,
  readExcerpts,
  removeExcerpt,
} from "./NotesFile";

const first: Excerpt = {
  id: "aaaa01",
  source: "Geometric Methods.pdf",
  page: 133,
  text: "Proposition 4.6. The exponential map exp : so(n) → SO(n) is surjective.",
  color: "yellow",
};
const second: Excerpt = { ...first, id: "bbbb02", page: 141, text: "It costs $5.", color: "pink" };

describe("notesPathFor", () => {
  it("names the notes after the document, in the same folder", () => {
    expect(notesPathFor("/papers/Geometric Methods.pdf")).toBe("/papers/Geometric Methods.notes.md");
    expect(notesPathFor("/papers/v1.2/draft.final.pdf")).toBe("/papers/v1.2/draft.final.notes.md");
    expect(notesPathFor("README")).toBe("README.notes.md");
    expect(isNotesPath("/papers/Geometric Methods.notes.md")).toBe(true);
    expect(isNotesPath("/papers/notes.md")).toBe(false);
  });
});

describe("addExcerpt", () => {
  it("starts a new file with a title and an Unsorted section", () => {
    const notes = addExcerpt(null, first, "Geometric Methods.pdf");
    expect(notes).toBe(
      "# Notes on Geometric Methods\n" +
        "\n" +
        "## Unsorted\n" +
        "\n" +
        "> Proposition 4.6. The exponential map exp : so(n) → SO(n) is surjective.\n" +
        "> — [p. 133](Geometric%20Methods.pdf#page=133&ex=aaaa01&color=yellow)\n",
    );
  });

  it("adds to the end of Unsorted, leaving the reader's text and later sections alone", () => {
    const notes =
      "# My notes\n\nSome thoughts with $x^2$.\n\n## Unsorted\n\n" +
      "> Proposition 4.6.\n> — [p. 133](Geometric%20Methods.pdf#page=133&ex=aaaa01&color=yellow)\n\n" +
      "## Questions\n\nWhy compact?\n";
    const updated = addExcerpt(notes, second, "Geometric Methods.pdf");
    expect(updated).toBe(
      "# My notes\n\nSome thoughts with $x^2$.\n\n## Unsorted\n\n" +
        "> Proposition 4.6.\n> — [p. 133](Geometric%20Methods.pdf#page=133&ex=aaaa01&color=yellow)\n\n" +
        "> It costs \\$5.\n> — [p. 141](Geometric%20Methods.pdf#page=141&ex=bbbb02&color=pink)\n\n" +
        "## Questions\n\nWhy compact?\n",
    );
  });

  it("adds an Unsorted section at the end when the reader removed it", () => {
    const updated = addExcerpt("# Notes\n\nJust text.\n\n\n", first, "Geometric Methods.pdf");
    expect(updated.startsWith("# Notes\n\nJust text.\n\n## Unsorted\n\n> Proposition")).toBe(true);
  });

  it("starts an empty file like a new one, minus the title", () => {
    expect(addExcerpt("", first, "x.pdf").startsWith("## Unsorted\n\n> Proposition")).toBe(true);
  });

  it("finds Unsorted at any heading level and ignores a heading inside code", () => {
    const notes = "# N\n\n### unsorted\n\n```\n## Unsorted\n```\n\nText.\n\n## Next\n";
    const updated = addExcerpt(notes, first, "x.pdf");
    expect(updated).toContain("```\n\nText.\n\n> Proposition");
    expect(updated.endsWith("&color=yellow)\n\n## Next\n")).toBe(true);
  });

  it("keeps Windows line endings", () => {
    const updated = addExcerpt("# N\r\n\r\n## Unsorted\r\n", first, "x.pdf");
    expect(updated).toContain("## Unsorted\r\n\r\n> Proposition");
    expect(updated.replace(/\r\n/g, "")).not.toContain("\n");
  });
});

describe("readExcerpts", () => {
  it("reads every excerpt back with the heading it's filed under", () => {
    let notes = addExcerpt(null, first, "Geometric Methods.pdf");
    notes += "\n## Where it fails\n\n";
    notes = notes + addExcerpt("", second, "x.pdf").replace("## Unsorted\n\n", "");
    expect(readExcerpts(notes)).toEqual([
      { excerpt: first, heading: "Unsorted" },
      { excerpt: second, heading: "Where it fails" },
    ]);
  });

  it("skips ordinary quotes, links without an id, and examples in code", () => {
    const notes =
      "> Just a quote.\n\n" +
      "> Typed by hand\n> — [p. 3](a.pdf#page=3)\n\n" +
      "```\n> In code\n> — [p. 3](a.pdf#page=3&ex=cccc03)\n```\n";
    expect(readExcerpts(notes)).toEqual([]);
  });

  it("reads back a source with spaces, parentheses and folders", () => {
    const odd = { ...first, source: "books/Lie Groups (2nd ed) #1.pdf" };
    expect(readExcerpts(addExcerpt(null, odd, "x.pdf"))[0].excerpt).toEqual(odd);
  });

  it("joins a quote the reader wrapped over several lines", () => {
    const notes = "> The exponential\n> map is onto.\n> — [p. 9](a.pdf#page=9&ex=dddd04&color=green)\n";
    expect(readExcerpts(notes)[0].excerpt.text).toBe("The exponential map is onto.");
  });
});

describe("removeExcerpt", () => {
  it("takes out exactly that quote, so adding then removing is a no-op", () => {
    const notes = "# N\n\nMine.\n\n## Unsorted\n\n## Questions\n\nWhy?\n";
    const added = addExcerpt(notes, first, "x.pdf");
    expect(removeExcerpt(added, first.id)).toBe("# N\n\nMine.\n\n## Unsorted\n\n## Questions\n\nWhy?\n");
  });

  it("leaves the notes unchanged when the excerpt is already gone", () => {
    const notes = newNotesFile("x.pdf");
    expect(removeExcerpt(notes, "ffff00")).toBe(notes);
  });
});

describe("a comment with an excerpt", () => {
  it("goes in its own paragraph below the quote, trimmed, without blank lines inside", () => {
    const notes = addExcerpt(newNotesFile("Geometric Methods.pdf"), first, "Geometric Methods.pdf", "  So every rotation\n\n has a log: $X$.  \n");
    expect(notes.endsWith(
      "> — [p. 133](Geometric%20Methods.pdf#page=133&ex=aaaa01&color=yellow)\n" +
        "\n" +
        "So every rotation\n" +
        " has a log: $X$.\n",
    )).toBe(true);
    expect(readExcerpts(notes).map((f) => f.excerpt.id)).toEqual(["aaaa01"]);
  });

  it("is removed with its excerpt while it's as written, and kept once the reader edits it", () => {
    const start = addExcerpt(newNotesFile("Geometric Methods.pdf"), first, "Geometric Methods.pdf");
    const withComment = addExcerpt(start, second, "Geometric Methods.pdf", "Cheap.");
    expect(removeExcerpt(withComment, second.id, "Cheap.")).toBe(start);

    const edited = withComment.replace("Cheap.", "Cheap, really.");
    expect(removeExcerpt(edited, second.id, "Cheap.")).toBe(`${start}\nCheap, really.\n`);
    // Without the comment, only the quote goes (as before).
    expect(removeExcerpt(withComment, second.id)).toBe(`${start}\nCheap.\n`);
  });

  it("keeps the file's CRLF line endings", () => {
    const crlf = newNotesFile("Geometric Methods.pdf").replace(/\n/g, "\r\n");
    const notes = addExcerpt(crlf, first, "Geometric Methods.pdf", "One\nTwo");
    expect(notes.endsWith("\r\n\r\nOne\r\nTwo\r\n")).toBe(true);
    expect(notes.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
});
