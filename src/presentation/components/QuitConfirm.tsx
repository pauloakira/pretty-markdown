import { useEffect } from "react";

interface QuitConfirmProps {
  tabCount: number;
  dirtyCount: number;
  onRemember: () => void;
  onForget: () => void;
  onCancel: () => void;
}

const plural = (n: number) => (n === 1 ? "" : "s");

/** Shown when quitting with tabs open: offer to reopen them next launch. */
export function QuitConfirm({
  tabCount,
  dirtyCount,
  onRemember,
  onForget,
  onCancel,
}: QuitConfirmProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="settings-overlay" onClick={onCancel}>
      <div
        className="confirm"
        role="dialog"
        aria-label="Reopen tabs on next launch"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm__msg">
          Reopen your {tabCount} open tab{plural(tabCount)} next time you launch?
        </p>
        {dirtyCount > 0 && (
          <p className="confirm__warn">
            ⚠ {dirtyCount} tab{plural(dirtyCount)} {dirtyCount === 1 ? "has" : "have"} unsaved
            edits that won&apos;t be kept — Cancel and ⌘S to save first.
          </p>
        )}
        <div className="confirm__actions">
          <button className="confirm__btn confirm__btn--ghost" onClick={onForget}>
            Don&apos;t reopen
          </button>
          <button className="confirm__btn confirm__btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm__btn confirm__btn--primary" onClick={onRemember}>
            Reopen next time
          </button>
        </div>
      </div>
    </div>
  );
}
