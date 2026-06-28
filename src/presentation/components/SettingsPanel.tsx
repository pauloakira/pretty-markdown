import { useEffect } from "react";
import {
  FONT_SCALE,
  READING_WIDTH,
  type Settings,
} from "../../domain/values/Settings";

interface SettingsPanelProps {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  onReset: () => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, onUpdate, onReset, onClose }: SettingsPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-panel__header">
          <h2 className="settings-panel__title">Settings</h2>
          <button className="settings-panel__close" aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </div>

        <label className="settings-field">
          <span className="settings-field__label">
            Reading width
            <span className="settings-field__value">{settings.readingWidthRem} rem</span>
          </span>
          <input
            type="range"
            min={READING_WIDTH.min}
            max={READING_WIDTH.max}
            step={READING_WIDTH.step}
            value={settings.readingWidthRem}
            onChange={(e) => onUpdate({ readingWidthRem: Number(e.target.value) })}
          />
          <span className="settings-field__hint">
            Wider reduces the side margins; narrower gives a more comfortable line length.
          </span>
        </label>

        <label className="settings-field">
          <span className="settings-field__label">
            Font size
            <span className="settings-field__value">{settings.fontScalePct}%</span>
          </span>
          <input
            type="range"
            min={FONT_SCALE.min}
            max={FONT_SCALE.max}
            step={FONT_SCALE.step}
            value={settings.fontScalePct}
            onChange={(e) => onUpdate({ fontScalePct: Number(e.target.value) })}
          />
        </label>

        <div className="settings-panel__footer">
          <button className="settings-reset" onClick={onReset}>
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
