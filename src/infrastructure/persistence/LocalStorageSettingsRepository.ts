import type { SettingsRepository } from "../../domain/ports/SettingsRepository";
import { clampSettings, defaultSettings, type Settings } from "../../domain/values/Settings";

const STORAGE_KEY = "pretty-markdown.settings.v1";

/**
 * Persists settings in the webview's localStorage. Reads are defensive: anything missing
 * or malformed falls back to defaults, and out-of-range values are clamped.
 */
export class LocalStorageSettingsRepository implements SettingsRepository {
  load(): Settings | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return clampSettings({ ...defaultSettings, ...parsed });
    } catch {
      return null;
    }
  }

  save(settings: Settings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage unavailable or over quota — settings simply won't persist.
    }
  }
}
