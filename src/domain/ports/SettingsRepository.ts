import type { Settings } from "../values/Settings";

/** Port: load/save user settings. Returns null when nothing has been saved yet. */
export interface SettingsRepository {
  load(): Settings | null;
  save(settings: Settings): void;
}
