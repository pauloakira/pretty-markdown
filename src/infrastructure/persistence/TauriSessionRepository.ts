import { invoke } from "@tauri-apps/api/core";
import type { SessionRepository } from "../../domain/ports/SessionRepository";
import { parseSession, type Session } from "../../domain/values/Session";

/**
 * Persists the session as JSON in the app config dir via native commands
 * (see src-tauri/src/lib.rs). Reads are defensive — malformed JSON yields null.
 */
export class TauriSessionRepository implements SessionRepository {
  async load(): Promise<Session | null> {
    try {
      const raw = await invoke<string | null>("read_session");
      if (!raw) return null;
      return parseSession(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async save(session: Session): Promise<void> {
    await invoke("write_session", { contents: JSON.stringify(session) });
  }

  async clear(): Promise<void> {
    await invoke("clear_session");
  }
}
