import { useEffect } from "react";

interface CloseConfirmProps {
  name: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/** Prompt shown when closing a tab with unsaved changes. */
export function CloseConfirm({ name, onSave, onDiscard, onCancel }: CloseConfirmProps) {
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
        aria-label="Unsaved changes"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm__msg">
          Save changes to <strong>{name}</strong> before closing?
        </p>
        <div className="confirm__actions">
          <button className="confirm__btn confirm__btn--ghost" onClick={onDiscard}>
            Don&apos;t Save
          </button>
          <button className="confirm__btn confirm__btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm__btn confirm__btn--primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
