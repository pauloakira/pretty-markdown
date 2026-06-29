import type { Session } from "../values/Session";

/** Port: persist/restore the workspace session (open tabs). */
export interface SessionRepository {
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(): Promise<void>;
}
