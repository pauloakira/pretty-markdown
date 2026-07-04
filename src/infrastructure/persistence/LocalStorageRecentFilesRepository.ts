import type { RecentFilesRepository } from "../../domain/ports/RecentFilesRepository";
import type { RecentFile } from "../../domain/values/RecentFile";

const STORAGE_KEY = "pretty-markdown.recent.v1";

/** Persists the recent-files list in localStorage; reads are defensive. */
export class LocalStorageRecentFilesRepository implements RecentFilesRepository {
  load(): RecentFile[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (f): f is RecentFile =>
            f !== null &&
            typeof f === "object" &&
            typeof f.path === "string" &&
            typeof f.name === "string",
        )
        .map((f) => ({ path: f.path, name: f.name }));
    } catch {
      return [];
    }
  }

  save(list: readonly RecentFile[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // storage unavailable — recents just won't persist
    }
  }
}
