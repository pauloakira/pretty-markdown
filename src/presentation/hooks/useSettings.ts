import { useCallback, useEffect, useState } from "react";
import { useContainer } from "../../composition/ContainerContext";
import { clampSettings, defaultSettings, type Settings } from "../../domain/values/Settings";

/**
 * Loads persisted settings, applies them live as CSS variables on the document root,
 * and persists every change. The reader's width and font size read these variables.
 */
export function useSettings() {
  const { settingsRepository } = useContainer();
  const [settings, setSettings] = useState<Settings>(
    () => settingsRepository.load() ?? defaultSettings,
  );

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--reading-width", `${settings.readingWidthRem}rem`);
    root.style.setProperty("--reader-font-scale", String(settings.fontScalePct / 100));
  }, [settings]);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = clampSettings({ ...prev, ...patch });
        settingsRepository.save(next);
        return next;
      });
    },
    [settingsRepository],
  );

  const reset = useCallback(() => {
    settingsRepository.save(defaultSettings);
    setSettings(defaultSettings);
  }, [settingsRepository]);

  return { settings, update, reset };
}
