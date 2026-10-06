import { vi } from "vitest";

/*
 * In-memory stand-ins for the Tauri bridge, for App-level tests. This module must not
 * import app code: test files load it from their `vi.mock` factories, e.g.
 *
 *   vi.mock("@tauri-apps/api/core", async () => (await import("./test/tauriMock")).tauriCore);
 */

/** The session file, as the real `TauriSessionRepository` reads and writes it. */
export const disk: { session: string | null } = { session: null };

export const tauriCore = {
  invoke: vi.fn(async (cmd: string, args?: { contents?: string }) => {
    if (cmd === "read_session") return disk.session;
    if (cmd === "write_session") disk.session = args?.contents ?? null;
    if (cmd === "clear_session") disk.session = null;
    if (cmd === "take_pending_files") return [];
    return undefined;
  }),
};

export const tauriEvent = { listen: vi.fn(async () => () => {}) };
