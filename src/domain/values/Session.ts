import { isGroupColor, type GroupColor } from "../entities/TabGroup";
import type { EditorMode } from "./ViewState";

/** A single restorable tab: which file, how it was being viewed, and its group. */
export interface SessionTab {
  readonly path: string;
  readonly mode: EditorMode;
  readonly scrollTop: number;
  /** Index into `Session.groups`, or null when ungrouped. */
  readonly group: number | null;
}

/** A restorable tab group. Its identity is its position in `Session.groups`. */
export interface SessionGroup {
  readonly name: string;
  readonly color: GroupColor;
  readonly collapsed: boolean;
}

/**
 * Persisted workspace session — the open files, which one was active, and the tab
 * groups. Version 1 (before groups) is still read; it simply has no groups.
 */
export interface Session {
  readonly version: 2;
  readonly activeIndex: number;
  readonly tabs: readonly SessionTab[];
  readonly groups: readonly SessionGroup[];
}

/** Defensively parse untrusted JSON (from disk) into a Session, or null if invalid. */
export function parseSession(raw: unknown): Session | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.tabs)) return null;

  const groups: SessionGroup[] = [];
  if (Array.isArray(obj.groups)) {
    for (const entry of obj.groups) {
      const g = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
      // Keep a slot even for a malformed group so the tabs' indexes still line up.
      groups.push({
        name: typeof g.name === "string" ? g.name : "",
        color: isGroupColor(g.color) ? g.color : "grey",
        collapsed: g.collapsed === true,
      });
    }
  }

  const tabs: SessionTab[] = [];
  for (const entry of obj.tabs) {
    if (typeof entry !== "object" || entry === null) continue;
    const t = entry as Record<string, unknown>;
    if (typeof t.path !== "string") continue;
    const group =
      typeof t.group === "number" && Number.isInteger(t.group) && t.group >= 0 && t.group < groups.length
        ? t.group
        : null;
    tabs.push({
      path: t.path,
      mode: t.mode === "edit" ? "edit" : "reader",
      scrollTop: typeof t.scrollTop === "number" ? t.scrollTop : 0,
      group,
    });
  }

  const activeIndex = typeof obj.activeIndex === "number" ? obj.activeIndex : 0;
  return { version: 2, activeIndex, tabs, groups };
}
