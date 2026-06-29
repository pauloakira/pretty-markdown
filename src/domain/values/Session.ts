import type { EditorMode } from "./ViewState";

/** A single restorable tab: which file, and how it was being viewed. */
export interface SessionTab {
  readonly path: string;
  readonly mode: EditorMode;
  readonly scrollTop: number;
}

/** Persisted workspace session — the open files and which one was active. */
export interface Session {
  readonly version: 1;
  readonly activeIndex: number;
  readonly tabs: readonly SessionTab[];
}

/** Defensively parse untrusted JSON (from disk) into a Session, or null if invalid. */
export function parseSession(raw: unknown): Session | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.tabs)) return null;

  const tabs: SessionTab[] = [];
  for (const entry of obj.tabs) {
    if (typeof entry !== "object" || entry === null) continue;
    const t = entry as Record<string, unknown>;
    if (typeof t.path !== "string") continue;
    tabs.push({
      path: t.path,
      mode: t.mode === "edit" ? "edit" : "reader",
      scrollTop: typeof t.scrollTop === "number" ? t.scrollTop : 0,
    });
  }

  const activeIndex = typeof obj.activeIndex === "number" ? obj.activeIndex : 0;
  return { version: 1, activeIndex, tabs };
}
