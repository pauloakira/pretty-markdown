import type { KeptNotes } from "../../domain/ports/KeptNotes";

const STORAGE_KEY = "pretty-markdown.kept-notes.v1";

/** The notes kept beside their PDF, in the webview's localStorage (a list of paths). */
export class LocalStorageKeptNotes implements KeptNotes {
  has(notesPath: string): boolean {
    return this.load().includes(notesPath);
  }

  add(notesPath: string): void {
    const kept = this.load();
    if (kept.includes(notesPath)) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...kept, notesPath]));
    } catch {
      // Storage unavailable: the offer simply comes back next time.
    }
  }

  private load(): string[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
    } catch {
      return [];
    }
  }
}
