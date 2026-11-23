import { describe, expect, it } from "vitest";
import type { Excerpt } from "./Excerpt";
import {
  addExcerpt,
  isNotesPath,
  newNotesFile,
  noteOf,
  notesPathFor,
  readExcerpts,
  removeExcerpt,
  restoreExcerpt,
  sameNote,
  segmentNotes,
  setExcerptColor,
  setNote,
  takeExcerpt,
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

describe("excerpt cards and their notes", () => {
  const start = addExcerpt(addExcerpt(null, first, "Geometric Methods.pdf"), second, "Geometric Methods.pdf");
  const withNotes = setNote(setNote(start, first.id, "So every rotation\n\nhas a log: $X$."), second.id, "Cheap.");

  it("cuts the notes into the text around them and cards, each quote with its note", () => {
    const segments = segmentNotes(withNotes);
    expect(segments.map((s) => s.kind)).toEqual(["text", "excerpt", "excerpt"]);
    expect(segments[0]).toEqual({ kind: "text", markdown: "# Notes on Geometric Methods\n\n## Unsorted" });
    expect(segments[1]).toMatchObject({ kind: "excerpt", note: "So every rotation\n\nhas a log: $X$." });
    expect(segments[2]).toMatchObject({ kind: "excerpt", note: "Cheap." });
  });

  it("takes text written under a quote in any editor as its note, up to the next heading", () => {
    const notes = `${start.trimEnd()}\nMy thought.\n\n## Later\n\nMore.\n`;
    const segments = segmentNotes(notes);
    expect(segments[2]).toMatchObject({ kind: "excerpt", note: "My thought." });
    expect(segments[3]).toEqual({ kind: "text", markdown: "## Later\n\nMore." });
  });

  it("writes, replaces and removes a note without touching anything else", () => {
    expect(withNotes).toContain("is surjective.\n> — [p. 133](Geometric%20Methods.pdf#page=133&ex=aaaa01&color=yellow)\n\nSo every rotation\n\nhas a log: $X$.\n\n> It costs");
    expect(setNote(setNote(withNotes, first.id, ""), second.id, "")).toBe(start);
    expect(setNote(withNotes, "ffffff", "x")).toBe(withNotes);
  });

  it("reads one excerpt's note, and compares notes as they're written", () => {
    expect(noteOf(withNotes, first.id)).toBe("So every rotation\n\nhas a log: $X$.");
    expect(noteOf(start, first.id)).toBe("");
    expect(noteOf(withNotes, "ffffff")).toBeNull();
    expect(sameNote("idea  \nmore\n\n", "\nidea\nmore")).toBe(true);
    expect(sameNote("idea", "idea!")).toBe(false);
  });

  it("deletes a card, quote and note, and Undo puts it back where it was", () => {
    const taken = takeExcerpt(withNotes, first.id);
    expect(taken?.notes).toBe(setNote(removeExcerpt(start, first.id), second.id, "Cheap."));
    expect(readExcerpts(taken?.notes ?? "").map((f) => f.excerpt.id)).toEqual([second.id]);
    expect(restoreExcerpt(taken?.notes ?? "", taken ?? { block: [], at: 0 })).toBe(withNotes);
  });

  it("recolours a quote's link", () => {
    const pink = setExcerptColor(withNotes, first.id, "pink");
    expect(readExcerpts(pink).map((f) => f.excerpt.color)).toEqual(["pink", "pink"]);
    expect(segmentNotes(pink)[1]).toMatchObject({ note: "So every rotation\n\nhas a log: $X$." });
  });

  it("keeps the file's CRLF line endings", () => {
    const crlf = start.replace(/\n/g, "\r\n");
    const notes = setNote(crlf, first.id, "One\nTwo");
    expect(notes).toContain("\r\n\r\nOne\r\nTwo\r\n\r\n> It costs");
    expect(notes.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
});
