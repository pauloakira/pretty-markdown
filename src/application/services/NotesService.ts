import { fileName } from "../../domain/entities/Document";
import type { NotesStore } from "../../domain/ports/NotesStore";
import {
  newExcerptId,
  normalizeExcerptText,
  type Excerpt,
} from "../../domain/values/Excerpt";
import type { HighlightColor } from "../../domain/values/Highlight";
import {
  addExcerpt,
  noteOf,
  notesPathFor,
  readExcerpts,
  restoreExcerpt,
  sameNote,
  setExcerptColor,
  setNote,
  takeExcerpt,
} from "../../domain/values/NotesFile";
import { roundRect, sameArea, type HighlightPlace, type PdfRect } from "../../domain/values/PdfRect";
import { err, ok, type Result } from "../../domain/values/Result";

/** A passage the reader picked in a document, to be kept in its notes. */
export interface TakenPassage {
  /** 1-based page number. */
  readonly page: number;
  /** The text as selected (line breaks and all; it's cleaned up here). */
  readonly text: string;
  readonly color: HighlightColor;
  /** The area its highlight covers, if it was highlighted (PDF points). */
  readonly rect?: PdfRect;
}

/** What `addToNotes` did, so the reader can be told and the addition undone. */
export interface AddedExcerpt {
  readonly notesPath: string;
  readonly excerpt: Excerpt;
  /** Whether this created the notes file. */
  readonly created: boolean;
}

/** An excerpt taken out of the notes, to put back (Undo). */
export interface RemovedExcerpt {
  readonly notesPath: string;
  readonly block: readonly string[];
  readonly at: number;
  /** The notes before and right after the removal, to tell whether they've changed since. */
  readonly before: string;
  readonly after: string;
}

/**
 * What saving a note did: saved; not saved because the note was changed elsewhere (another
 * tab or app) since the reader started from it, with that version; or not saved because
 * its quote is gone from the notes.
 */
export type NoteSaved =
  | { readonly kind: "saved" }
  | { readonly kind: "changed"; readonly note: string }
  | { readonly kind: "gone" };

/** A document's notes file, as read for the Notes panel. */
export interface DocumentNotes {
  readonly notesPath: string;
  /** The file's text, or null if it doesn't exist yet (made at the first Add to notes). */
  readonly text: string | null;
  readonly excerptCount: number;
}

/**
 * Keeps excerpts in each document's notes file, `<name>.notes.md` beside it
 * (docs/RESEARCH_READER.md). Each change reads the file, edits its text and writes it
 * back; changes to the same file are queued, so two quick additions can't overwrite each
 * other.
 */
export class NotesService {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: NotesStore,
    /** Values in [0, 1), for excerpt ids. */
    private readonly random: () => number = Math.random,
  ) {}

  /** The notes file of the document at `documentPath`. */
  notesPathFor(documentPath: string): string {
    return notesPathFor(documentPath);
  }

  /**
   * The notes of the document at `documentPath`: where its notes file is, its text (null
   * if there's none yet), and how many excerpts it holds.
   */
  async readNotes(documentPath: string): Promise<Result<DocumentNotes>> {
    const notesPath = notesPathFor(documentPath);
    const current = await this.store.read(notesPath);
    if (!current.ok) return err(`Couldn't read your notes: ${current.error}`);
    const text = current.value;
    return ok({ notesPath, text, excerptCount: text === null ? 0 : readExcerpts(text).length });
  }

  /** Add `passage` from the document at `documentPath` to the end of its notes' "Unsorted". */
  addToNotes(documentPath: string, passage: TakenPassage): Promise<Result<AddedExcerpt>> {
    const text = normalizeExcerptText(passage.text);
    if (text === "") return Promise.resolve(err("Select some text to add to your notes."));
    const notesPath = notesPathFor(documentPath);
    const documentName = fileName(documentPath);
    const excerpt: Excerpt = {
      id: newExcerptId(this.random),
      // The notes file sits beside the document, so the document is found by name alone.
      source: documentName,
      page: passage.page,
      text,
      color: passage.color,
      ...(passage.rect ? { rect: roundRect(passage.rect) } : {}),
    };
    return this.queued(notesPath, async () => {
      const current = await this.store.read(notesPath);
      if (!current.ok) return err(`Couldn't read your notes: ${current.error}`);
      const written = await this.store.write(notesPath, addExcerpt(current.value, excerpt, documentName));
      if (!written.ok) return err(`Couldn't save your notes: ${written.error}`);
      return ok({ notesPath, excerpt, created: current.value === null });
    });
  }

  /**
   * The excerpts in the notes of the document at `documentPath` that quote the highlight
   * at `place` (same page, same area): what to offer to remove when that highlight goes.
   * None if there are no notes yet.
   */
  async excerptsOf(documentPath: string, place: HighlightPlace): Promise<Result<readonly Excerpt[]>> {
    const notesPath = notesPathFor(documentPath);
    const current = await this.store.read(notesPath);
    if (!current.ok) return err(`Couldn't read your notes: ${current.error}`);
    if (current.value === null) return ok([]);
    const source = fileName(documentPath);
    return ok(
      readExcerpts(current.value)
        .map((found) => found.excerpt)
        .filter(
          (excerpt) =>
            excerpt.source === source &&
            excerpt.page === place.page &&
            excerpt.rect !== undefined &&
            sameArea(excerpt.rect, place.rect),
        ),
    );
  }

  /**
   * Take an excerpt and its note out of a notes file (Remove, Delete). Resolves to what was
   * taken, for Undo, or null if it was gone already.
   */
  removeFromNotes(notesPath: string, id: string): Promise<Result<RemovedExcerpt | null>> {
    return this.edit(notesPath, (text) => {
      const taken = takeExcerpt(text, id);
      return taken === null ? null : { text: taken.notes, value: { notesPath, block: taken.block, at: taken.at, before: text, after: taken.notes } };
    });
  }

  /**
   * Undo a removal: put the excerpt back where it was. If the notes haven't changed since,
   * they're exactly as before; otherwise it goes back at the line it was taken from.
   */
  restoreToNotes(removed: RemovedExcerpt): Promise<Result<void>> {
    return this.edit(removed.notesPath, (text) => ({
      text: text === removed.after ? removed.before : restoreExcerpt(text, removed),
      value: undefined,
    })).then((result) => (result.ok ? ok(undefined) : result));
  }

  /**
   * Write the reader's note on excerpt `id` (an empty note removes it). `from` is the note
   * the reader was editing: if the file now holds a different one (written elsewhere in
   * the meantime), nothing is written and that note comes back, so neither is lost.
   * Without `from`, the note is written whatever is there.
   */
  setNote(notesPath: string, id: string, note: string, from?: string): Promise<Result<NoteSaved>> {
    return this.edit<NoteSaved>(notesPath, (text) => {
      const current = noteOf(text, id);
      if (current === null) return { text, value: { kind: "gone" } };
      if (from !== undefined && !sameNote(current, from) && !sameNote(current, note)) {
        return { text, value: { kind: "changed", note: current } };
      }
      return { text: setNote(text, id, note), value: { kind: "saved" } };
    }).then((result) => (result.ok ? ok(result.value ?? { kind: "gone" }) : result));
  }

  /** Recolour excerpt `id` (its link's colour; the highlight is the viewer's). */
  setColor(notesPath: string, id: string, color: HighlightColor): Promise<Result<void>> {
    return this.edit(notesPath, (text) => ({ text: setExcerptColor(text, id, color), value: undefined })).then(
      (result) => (result.ok ? ok(undefined) : result),
    );
  }

  /**
   * Read the notes file, change its text with `change`, and write it back if it changed,
   * queued behind other changes to the same file. `change` returns the new text and a
   * value to resolve to, or null for nothing to do (resolves to null). A missing file
   * has nothing to change.
   */
  private edit<T>(
    notesPath: string,
    change: (text: string) => { readonly text: string; readonly value: T } | null,
  ): Promise<Result<T | null>> {
    return this.queued(notesPath, async () => {
      const current = await this.store.read(notesPath);
      if (!current.ok) return err(`Couldn't read your notes: ${current.error}`);
      if (current.value === null) return ok(null);
      const changed = change(current.value);
      if (changed === null) return ok(null);
      if (changed.text !== current.value) {
        const written = await this.store.write(notesPath, changed.text);
        if (!written.ok) return err(`Couldn't save your notes: ${written.error}`);
      }
      return ok(changed.value);
    });
  }

  /** Run `task` after every earlier task on the same file has finished. */
  private queued<T>(path: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(path) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.catch(() => {});
    this.queues.set(path, settled);
    void settled.then(() => {
      if (this.queues.get(path) === settled) this.queues.delete(path);
    });
    return next;
  }
}
