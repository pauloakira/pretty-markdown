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

/** The app's event listeners, by event name, so tests can emit events to it. */
export const listeners = new Map<string, (event: { payload: unknown }) => void>();

export const tauriEvent = {
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(name, handler);
    return () => {
      if (listeners.get(name) === handler) listeners.delete(name);
    };
  }),
};

/** Deliver an event from the native side, as `emit` in Rust would. */
export function emitEvent(name: string, payload: unknown) {
  listeners.get(name)?.({ payload });
}
