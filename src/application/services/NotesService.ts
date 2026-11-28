import { fileName } from "../../domain/entities/Document";
import type { FolderAccess } from "../../domain/ports/FolderAccess";
import type { KeptNotes } from "../../domain/ports/KeptNotes";
import type { NotesStore } from "../../domain/ports/NotesStore";
import { folderHolds, isNoAccess } from "../../domain/values/FileAccess";
import {
  newExcerptId,
  normalizeExcerptText,
  type Excerpt,
} from "../../domain/values/Excerpt";
import type { HighlightColor } from "../../domain/values/Highlight";
import {
  addExcerpt,
  isBesideDocument,
  noteOf,
  notesPathFor,
  notesPathsFor,
  readExcerpts,
  restoreExcerpt,
  sameNote,
  setExcerptColor,
  setNote,
  takeExcerpt,
} from "../../domain/values/NotesFile";
import { rebaseLinks, relativePath, resolvePath } from "../../domain/values/Link";
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

/**
 * What asking for the notes' folder came to: allowed; the reader cancelled; or they allowed
 * a folder that doesn't hold the document, so its notes still can't be reached.
 */
export type FolderAllowed = "allowed" | "cancelled" | "elsewhere";

/** The quotes of a highlight, and the notes file they're in. */
export interface QuotedIn {
  readonly notesPath: string;
  readonly excerpts: readonly Excerpt[];
}

/** Notes moved from right beside their PDF into "Notes". */
export interface NotesMoved {
  readonly from: string;
  readonly to: string;
  /** The notes as written in their new place (relative links rebased). */
  readonly text: string;
  /** Why the old file is still there, if it couldn't be removed; else null. */
  readonly leftBehind: string | null;
}

/** Kept in memory only: for tests, and where nothing is remembered between launches. */
class MemoryKeptNotes implements KeptNotes {
  private readonly kept = new Set<string>();
  has(notesPath: string): boolean {
    return this.kept.has(notesPath);
  }
  add(notesPath: string): void {
    this.kept.add(notesPath);
  }
}

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
    /** Where folders must be allowed before files can be made in them (iPadOS); else null. */
    private readonly folderAccess: FolderAccess | null = null,
    /** Notes the reader chose to keep beside their PDF: not offered to move again. */
    private readonly kept: KeptNotes = new MemoryKeptNotes(),
  ) {}

  /**
   * Whether `error` (from reading or changing notes) means the notes' folder must be
   * allowed first, and that can be asked for here.
   */
  needsFolder(error: string): boolean {
    return this.folderAccess !== null && isNoAccess(error);
  }

  /** Ask the reader to allow the folder of the document at `documentPath`, for its notes. */
  async allowNotesFolder(documentPath: string): Promise<Result<FolderAllowed>> {
    if (this.folderAccess === null) return ok("allowed");
    const picked = await this.folderAccess.allowFolderOf(documentPath);
    if (!picked.ok) return err(`Couldn't allow the folder: ${picked.error}`);
    if (picked.value === null) return ok("cancelled");
    return ok(folderHolds(picked.value, notesPathFor(documentPath)) ? "allowed" : "elsewhere");
  }

  /** Where a new notes file for the document at `documentPath` goes. */
  notesPathFor(documentPath: string): string {
    return notesPathFor(documentPath);
  }

  /**
   * The notes file of the document at `documentPath` and its text: the first of its
   * places that has one ("Notes", then beside the document), or the new file's place and
   * null if there's none yet. A PDF never gets a second notes file.
   */
  private async locate(documentPath: string): Promise<Result<{ notesPath: string; text: string | null }>> {
    for (const notesPath of notesPathsFor(documentPath)) {
      const current = await this.store.read(notesPath);
      if (!current.ok) return err(`Couldn't read your notes: ${current.error}`);
      if (current.value !== null) return ok({ notesPath, text: current.value });
    }
    return ok({ notesPath: notesPathFor(documentPath), text: null });
  }

  /**
   * The notes of the document at `documentPath`: where its notes file is, its text (null
   * if there's none yet), and how many excerpts it holds.
   */
  async readNotes(documentPath: string): Promise<Result<DocumentNotes>> {
    const found = await this.locate(documentPath);
    if (!found.ok) return found;
    const { notesPath, text } = found.value;
    return ok({ notesPath, text, excerptCount: text === null ? 0 : readExcerpts(text).length });
  }

  /**
   * Whether to offer moving the notes at `notesPath` into "Notes": they're right beside the
   * document at `documentPath` (made before the Notes folder), and the reader hasn't chosen
   * to keep them there.
   */
  offersMove(notesPath: string, documentPath: string): boolean {
    return isBesideDocument(notesPath, documentPath) && !this.kept.has(notesPath);
  }

  /** The reader keeps the notes at `notesPath` where they are: don't offer to move them. */
  keepInPlace(notesPath: string): void {
    this.kept.add(notesPath);
  }

  /**
   * Move the notes right beside the document at `documentPath` into its "Notes" folder,
   * with their relative links rebased so they still reach the same files. Safe at every
   * step: the new file is written and read back before the old one goes, and nothing is
   * written over notes already in "Notes".
   */
  moveToNotesFolder(documentPath: string): Promise<Result<NotesMoved>> {
    const [to, from] = notesPathsFor(documentPath) as [string, string];
    return this.queued(from, () =>
      this.queued(to, async (): Promise<Result<NotesMoved>> => {
        const there = await this.store.read(to);
        if (!there.ok) return err(`Couldn't move your notes: ${there.error}`);
        if (there.value !== null) return err(`There are notes in the Notes folder already, so these were kept where they are.`);
        const current = await this.store.read(from);
        if (!current.ok) return err(`Couldn't read your notes: ${current.error}`);
        if (current.value === null) return err("These notes aren't beside the PDF any more.");
        const text = rebaseLinks(current.value, from, to);
        const written = await this.store.write(to, text);
        if (!written.ok) return err(`Couldn't move your notes: ${written.error}`);
        const check = await this.store.read(to);
        if (!check.ok || check.value !== text) {
          await this.store.remove(to);
          return err("Couldn't move your notes: the copy in the Notes folder didn't read back the same. They were kept where they are.");
        }
        const removed = await this.store.remove(from);
        return ok({ from, to, text, leftBehind: removed.ok ? null : removed.error });
      }),
    );
  }

  /** Add `passage` from the document at `documentPath` to the end of its notes' "Unsorted". */
  async addToNotes(documentPath: string, passage: TakenPassage): Promise<Result<AddedExcerpt>> {
    const text = normalizeExcerptText(passage.text);
    if (text === "") return err("Select some text to add to your notes.");
    const documentName = fileName(documentPath);
    const id = newExcerptId(this.random);
    const found = await this.locate(documentPath);
    if (!found.ok) return found;
    const { notesPath } = found.value;
    const excerpt: Excerpt = {
      id,
      // Linked relative to the notes file ("../Paper.pdf" from "Notes"), so the link works
      // in any Markdown app and survives moving the whole folder.
      source: relativePath(notesPath, documentPath),
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
  async excerptsOf(documentPath: string, place: HighlightPlace): Promise<Result<QuotedIn>> {
    const found = await this.locate(documentPath);
    if (!found.ok) return found;
    const { notesPath, text } = found.value;
    if (text === null) return ok({ notesPath, excerpts: [] });
    return ok({
      notesPath,
      excerpts: readExcerpts(text)
        .map((found) => found.excerpt)
        .filter(
          (excerpt) =>
            resolvePath(excerpt.source, notesPath) === documentPath &&
            excerpt.page === place.page &&
            excerpt.rect !== undefined &&
            sameArea(excerpt.rect, place.rect),
        ),
    });
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
