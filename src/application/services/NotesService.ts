import { fileName } from "../../domain/entities/Document";
import type { NotesStore } from "../../domain/ports/NotesStore";
import {
  newExcerptId,
  normalizeExcerptText,
  type Excerpt,
} from "../../domain/values/Excerpt";
import type { HighlightColor } from "../../domain/values/Highlight";
import { addExcerpt, notesPathFor, removeExcerpt } from "../../domain/values/NotesFile";
import { err, ok, type Result } from "../../domain/values/Result";

/** A passage the reader picked in a document, to be kept in its notes. */
export interface TakenPassage {
  /** 1-based page number. */
  readonly page: number;
  /** The text as selected (line breaks and all; it's cleaned up here). */
  readonly text: string;
  readonly color: HighlightColor;
}

/** What `addToNotes` did, so the reader can be told and the addition undone. */
export interface AddedExcerpt {
  readonly notesPath: string;
  readonly excerpt: Excerpt;
  /** Whether this created the notes file. */
  readonly created: boolean;
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
    };
    return this.queued(notesPath, async () => {
      const current = await this.store.read(notesPath);
      if (!current.ok) return err(`Couldn't read your notes: ${current.error}`);
      const written = await this.store.write(notesPath, addExcerpt(current.value, excerpt, documentName));
      if (!written.ok) return err(`Couldn't save your notes: ${written.error}`);
      return ok({ notesPath, excerpt, created: current.value === null });
    });
  }

  /** Take an excerpt out of a notes file again (Undo). Nothing to do if it's gone already. */
  removeFromNotes(notesPath: string, id: string): Promise<Result<void>> {
    return this.queued(notesPath, async () => {
      const current = await this.store.read(notesPath);
      if (!current.ok) return err(`Couldn't read your notes: ${current.error}`);
      if (current.value === null) return ok(undefined);
      const updated = removeExcerpt(current.value, id);
      if (updated === current.value) return ok(undefined);
      const written = await this.store.write(notesPath, updated);
      return written.ok ? ok(undefined) : err(`Couldn't save your notes: ${written.error}`);
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
