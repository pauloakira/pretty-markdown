import type { Document } from "../../domain/entities/Document";
import { toSession, type Workspace } from "../../domain/entities/Workspace";
import type { SessionRepository } from "../../domain/ports/SessionRepository";
import type { EditorMode } from "../../domain/values/ViewState";
import type { DocumentService } from "./DocumentService";

/** A tab reconstructed from the saved session, ready to populate the workspace. */
export interface RestoredTab {
  readonly document: Document;
  readonly mode: EditorMode;
  readonly scrollTop: number;
}

export interface RestoredSession {
  readonly tabs: readonly RestoredTab[];
  readonly activeIndex: number;
}

/**
 * Persists and restores the workspace session. On restore it re-reads each saved file
 * from disk (skipping any that have moved or been deleted), so the stored JSON only needs
 * the file paths, not their contents.
 */
export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly documents: DocumentService,
  ) {}

  async persist(workspace: Workspace): Promise<void> {
    await this.repository.save(toSession(workspace));
  }

  async clear(): Promise<void> {
    await this.repository.clear();
  }

  async restore(): Promise<RestoredSession> {
    const session = await this.repository.load();
    if (!session || session.tabs.length === 0) return { tabs: [], activeIndex: 0 };

    const tabs: RestoredTab[] = [];
    for (const entry of session.tabs) {
      const outcome = await this.documents.load(entry.path);
      if (outcome.kind === "opened") {
        tabs.push({ document: outcome.document, mode: entry.mode, scrollTop: entry.scrollTop });
      }
    }
    return { tabs, activeIndex: session.activeIndex };
  }
}
