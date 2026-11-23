import { describe, expect, it } from "vitest";
import type { NotesStore } from "../../domain/ports/NotesStore";
import { readExcerpts } from "../../domain/values/NotesFile";
import { err, ok, type Result } from "../../domain/values/Result";
import { NotesService } from "./NotesService";

/** An in-memory notes store; `failRead` makes reads fail like an unreadable file. */
class FakeNotesStore implements NotesStore {
  readonly files = new Map<string, string>();
  failRead = false;
  writes = 0;

  async read(path: string): Promise<Result<string | null>> {
    await Promise.resolve();
    if (this.failRead) return err("Permission denied");
    return ok(this.files.get(path) ?? null);
  }

  async write(path: string, text: string): Promise<Result<void>> {
    await Promise.resolve();
    this.writes += 1;
    this.files.set(path, text);
    return ok(undefined);
  }
}

/** Ids from a fixed sequence of random values. */
function sequence(): () => number {
  let n = 0;
  return () => ((n++ % 16) + 0.5) / 16;
}

const PDF = "/papers/Geometric Methods.pdf";
const NOTES = "/papers/Geometric Methods.notes.md";

describe("NotesService", () => {
  it("reads a document's notes for the Notes panel: none yet, then the text and its excerpts", async () => {
    const store = new FakeNotesStore();
    const notes = new NotesService(store, sequence());
    expect(await notes.readNotes(PDF)).toEqual(ok({ notesPath: NOTES, text: null, excerptCount: 0 }));

    await notes.addToNotes(PDF, { page: 1, text: "One.", color: "yellow" });
    await notes.addToNotes(PDF, { page: 2, text: "Two.", color: "green" });
    const read = await notes.readNotes(PDF);
    expect(read.ok && read.value.excerptCount).toBe(2);
    expect(read.ok && read.value.text).toBe(store.files.get(NOTES));

    store.failRead = true;
    expect((await notes.readNotes(PDF)).ok).toBe(false);
  });

  it("creates the notes file beside the PDF on the first addition", async () => {
    const store = new FakeNotesStore();
    const notes = new NotesService(store, sequence());
    const added = await notes.addToNotes(PDF, { page: 133, text: "The expo-\nnential map.", color: "blue" });

    expect(added.ok && added.value.created).toBe(true);
    expect(added.ok && added.value.notesPath).toBe(NOTES);
    const filed = readExcerpts(store.files.get(NOTES) ?? "");
    expect(filed).toEqual([
      {
        heading: "Unsorted",
        excerpt: { id: "012345", source: "Geometric Methods.pdf", page: 133, text: "The exponential map.", color: "blue" },
      },
    ]);
  });

  it("adds to an existing file without touching what the reader wrote", async () => {
    const store = new FakeNotesStore();
    store.files.set(NOTES, "# Mine\n\nA thought about $x$.\n");
    const notes = new NotesService(store, sequence());
    const added = await notes.addToNotes(PDF, { page: 2, text: "Lemma.", color: "yellow" });

    expect(added.ok && added.value.created).toBe(false);
    expect(store.files.get(NOTES)?.startsWith("# Mine\n\nA thought about $x$.\n\n## Unsorted\n")).toBe(true);
  });

  it("never starts a new file over notes it couldn't read", async () => {
    const store = new FakeNotesStore();
    store.files.set(NOTES, "# Precious notes\n");
    store.failRead = true;
    const added = await new NotesService(store).addToNotes(PDF, { page: 1, text: "x", color: "yellow" });

    expect(added).toEqual({ ok: false, error: "Couldn't read your notes: Permission denied" });
    expect(store.writes).toBe(0);
    expect(store.files.get(NOTES)).toBe("# Precious notes\n");
  });

  it("refuses an empty selection", async () => {
    const store = new FakeNotesStore();
    const added = await new NotesService(store).addToNotes(PDF, { page: 1, text: " \n ", color: "yellow" });
    expect(added.ok).toBe(false);
    expect(store.writes).toBe(0);
  });

  it("keeps both of two quick additions to the same file", async () => {
    const store = new FakeNotesStore();
    const notes = new NotesService(store, sequence());
    await Promise.all([
      notes.addToNotes(PDF, { page: 1, text: "First.", color: "yellow" }),
      notes.addToNotes(PDF, { page: 2, text: "Second.", color: "green" }),
    ]);
    expect(readExcerpts(store.files.get(NOTES) ?? "").map((f) => f.excerpt.text)).toEqual(["First.", "Second."]);
  });

  it("removes an addition again (Undo)", async () => {
    const store = new FakeNotesStore();
    store.files.set(NOTES, "# Mine\n\n## Unsorted\n");
    const notes = new NotesService(store, sequence());
    const added = await notes.addToNotes(PDF, { page: 1, text: "Gone soon.", color: "pink" });
    if (!added.ok) throw new Error(added.error);

    expect((await notes.removeFromNotes(NOTES, added.value.excerpt.id)).ok).toBe(true);
    expect(store.files.get(NOTES)).toBe("# Mine\n\n## Unsorted\n");
  });

  it("keeps the highlight's area, in whole points, and finds the quote from it", async () => {
    const store = new FakeNotesStore();
    const notes = new NotesService(store, sequence());
    const rect = [72.4, 540.9, 300.2, 552.1] as const;
    const added = await notes.addToNotes(PDF, { page: 7, text: "Lemma 3.", color: "green", rect });
    await notes.addToNotes(PDF, { page: 7, text: "Unhighlighted.", color: "green" });
    if (!added.ok) throw new Error(added.error);
    expect(added.value.excerpt.rect).toEqual([72, 540, 301, 553]);

    const found = await notes.excerptsOf(PDF, { page: 7, rect: [72, 540, 301, 553] });
    expect(found.ok && found.value.map((e) => e.text)).toEqual(["Lemma 3."]);
    const elsewhere = await notes.excerptsOf(PDF, { page: 8, rect: [72, 540, 301, 553] });
    expect(elsewhere.ok && elsewhere.value).toEqual([]);
  });

  it("finds no quotes for a highlight when there are no notes, or they're another PDF's", async () => {
    const store = new FakeNotesStore();
    const notes = new NotesService(store, sequence());
    expect(await notes.excerptsOf(PDF, { page: 1, rect: [0, 0, 10, 10] })).toEqual({ ok: true, value: [] });
    store.files.set(
      NOTES,
      "## Unsorted\n\n> Elsewhere.\n> — [p. 1](Other.pdf#page=1&ex=abcdef&color=yellow&rect=0,0,10,10)\n",
    );
    expect(await notes.excerptsOf(PDF, { page: 1, rect: [0, 0, 10, 10] })).toEqual({ ok: true, value: [] });
  });

  it("saves a note only over the one the reader started from; another is handed back", async () => {
    const store = new FakeNotesStore();
    const notes = new NotesService(store, sequence());
    const added = await notes.addToNotes(PDF, { page: 1, text: "One.", color: "yellow" });
    if (!added.ok) throw new Error(added.error);
    const id = added.value.excerpt.id;

    expect(await notes.setNote(NOTES, id, "Mine.", "")).toEqual(ok({ kind: "saved" }));
    // Written elsewhere in the meantime: kept, and handed back.
    store.files.set(NOTES, (store.files.get(NOTES) ?? "").replace("Mine.", "Theirs."));
    expect(await notes.setNote(NOTES, id, "Mine, again.", "Mine.")).toEqual(ok({ kind: "changed", note: "Theirs." }));
    expect(store.files.get(NOTES)).toContain("Theirs.");
    // The same words either way is no conflict (spaces at line ends don't count).
    expect(await notes.setNote(NOTES, id, "Theirs.  ", "Mine.")).toEqual(ok({ kind: "saved" }));
    // Without `from`, it's written whatever is there.
    expect(await notes.setNote(NOTES, id, "Forced.")).toEqual(ok({ kind: "saved" }));
    expect(store.files.get(NOTES)).toContain("Forced.");
    // The quote is gone: nothing to write it under.
    expect(await notes.setNote(NOTES, "ffffff", "x", "")).toEqual(ok({ kind: "gone" }));
  });
});
