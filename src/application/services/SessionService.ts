import type { Document } from "../../domain/entities/Document";
import { toSession, type Workspace } from "../../domain/entities/Workspace";
import type { SessionRepository } from "../../domain/ports/SessionRepository";
import type { SessionGroup } from "../../domain/values/Session";
import type { EditorMode, PdfView } from "../../domain/values/ViewState";
import type { DocumentService } from "./DocumentService";

/** A tab reconstructed from the saved session, ready to populate the workspace. */
export interface RestoredTab {
  readonly document: Document;
  readonly mode: EditorMode;
  readonly scrollTop: number;
  /** Where a PDF tab was; absent for markdown (and for PDFs from older sessions). */
  readonly pdf?: PdfView;
  /** Index into `RestoredSession.groups`, or null when ungrouped. */
  readonly group: number | null;
}

export interface RestoredSession {
  readonly tabs: readonly RestoredTab[];
  readonly groups: readonly SessionGroup[];
  readonly activeIndex: number;
}

/**
 * Persists and restores the workspace session. On restore it re-reads each saved file
 * from disk (skipping any that have moved or been deleted), so the stored JSON only needs
 * the file paths, not their contents.
 *
 * The session is autosaved as the workspace changes rather than only at quit: on macOS,
 * Dock → Quit, logout, or a crash end the process without any chance to prompt, and
 * saving only in the prompt left a months-old session being restored every launch.
 */
export class SessionService {
  /** Serialized form of the last session written (or loaded), to skip no-op writes. */
  private lastSaved: string | null = null;
  /** Set once the user opts out ("don't reopen"); autosave then stays off. */
  private suspended = false;

  constructor(
    private readonly repository: SessionRepository,
    private readonly documents: DocumentService,
  ) {}

  /** Write the session now (used by the quit prompt). */
  async persist(workspace: Workspace): Promise<void> {
    const session = toSession(workspace);
    this.lastSaved = JSON.stringify(session);
    await this.repository.save(session);
  }

  /**
   * Write the session only if its restorable part (open paths, active tab, modes,
   * scroll) changed since the last write. Edits to document content don't count.
   * Returns whether anything was written.
   */
  async autosave(workspace: Workspace): Promise<boolean> {
    if (this.suspended) return false;
    const session = toSession(workspace);
    const serialized = JSON.stringify(session);
    if (serialized === this.lastSaved) return false;
    this.lastSaved = serialized;
    await this.repository.save(session);
    return true;
  }

  /** Forget the session and stop autosaving (the user chose not to reopen tabs). */
  async clear(): Promise<void> {
    this.suspended = true;
    await this.repository.clear();
  }

  async restore(): Promise<RestoredSession> {
    const session = await this.repository.load();
    // What's on disk is the baseline: autosave rewrites only when the workspace differs.
    this.lastSaved = session ? JSON.stringify(session) : null;
    if (!session || session.tabs.length === 0) return { tabs: [], groups: [], activeIndex: 0 };

    const tabs: RestoredTab[] = [];
    for (const entry of session.tabs) {
      const outcome = await this.documents.load(entry.path);
      if (outcome.kind === "opened") {
        tabs.push({
          document: outcome.document,
          mode: entry.mode,
          scrollTop: entry.scrollTop,
          group: entry.group,
          ...(entry.pdf ? { pdf: entry.pdf } : {}),
        });
      }
    }
    return { tabs, groups: session.groups, activeIndex: session.activeIndex };
  }
}
