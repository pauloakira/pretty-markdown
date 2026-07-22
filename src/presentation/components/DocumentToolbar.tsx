import type { EditorMode } from "../../domain/values/ViewState";

interface DocumentToolbarProps {
  name: string;
  mode: EditorMode;
  dirty: boolean;
  onToggleMode: () => void;
  onSave: () => void;
  onExportPdf: () => void;
}

export function DocumentToolbar({
  name,
  mode,
  dirty,
  onToggleMode,
  onSave,
  onExportPdf,
}: DocumentToolbarProps) {
  return (
    <div className="doctoolbar">
      <span className="doctoolbar__name">
        {name}
        {dirty && (
          <span className="doctoolbar__dirty" title="Unsaved changes" aria-label="Unsaved changes">
            ●
          </span>
        )}
      </span>
      <div className="doctoolbar__actions">
        <button className="doctoolbar__btn" onClick={onExportPdf} title="Export to PDF (⌘P)">
          Export PDF
        </button>
        <button
          className="doctoolbar__btn"
          onClick={onSave}
          disabled={!dirty}
          title="Save (⌘S)"
        >
          Save
        </button>
        <div className="segmented" role="group" aria-label="View mode">
          <button
            className={`segmented__btn ${mode === "reader" ? "segmented__btn--active" : ""}`}
            onClick={() => mode !== "reader" && onToggleMode()}
          >
            Read
          </button>
          <button
            className={`segmented__btn ${mode === "edit" ? "segmented__btn--active" : ""}`}
            onClick={() => mode !== "edit" && onToggleMode()}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
