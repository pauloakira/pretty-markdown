import type { EditorMode } from "../../domain/values/ViewState";
import { ContentsButton } from "./ContentsSidebar";

interface DocumentToolbarProps {
  name: string;
  mode: EditorMode;
  dirty: boolean;
  onToggleMode: () => void;
  onSave: () => void;
  onExportPdf: () => void;
  contentsOpen: boolean;
  onToggleContents: () => void;
}

export function DocumentToolbar({
  name,
  mode,
  dirty,
  onToggleMode,
  onSave,
  onExportPdf,
  contentsOpen,
  onToggleContents,
}: DocumentToolbarProps) {
  return (
    <div className="doctoolbar">
      <div className="doctoolbar__lead">
        {/* The contents follow the rendered document, so they're there in Read mode. */}
        {mode === "reader" && <ContentsButton open={contentsOpen} onToggle={onToggleContents} />}
        <span className="doctoolbar__name">
          {name}
          {dirty && (
            <span className="doctoolbar__dirty" title="Unsaved changes" aria-label="Unsaved changes">
              ●
            </span>
          )}
        </span>
      </div>
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
