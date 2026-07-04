import type { RecentFile } from "../../domain/values/RecentFile";

interface WelcomeProps {
  recents: readonly RecentFile[];
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onOpenSettings: () => void;
}

export function Welcome({ recents, onOpen, onOpenRecent, onOpenSettings }: WelcomeProps) {
  return (
    <div className="welcome">
      <button
        className="welcome__settings"
        aria-label="Settings"
        title="Settings"
        onClick={onOpenSettings}
      >
        ⚙
      </button>
      <h1 className="welcome__title">pretty-markdown</h1>
      <p className="welcome__subtitle">
        A beautiful reader for markdown with LaTeX math.
      </p>
      <button className="welcome__cta" onClick={onOpen}>
        Open a document
      </button>

      {recents.length > 0 && (
        <div className="welcome__recent">
          <div className="welcome__recent-title">Recent</div>
          <ul className="welcome__recent-list">
            {recents.map((file) => (
              <li key={file.path}>
                <button
                  className="welcome__recent-item"
                  title={file.path}
                  onClick={() => onOpenRecent(file.path)}
                >
                  <span className="welcome__recent-name">{file.name}</span>
                  <span className="welcome__recent-path">{file.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="welcome__hint">
        Try a <code>.md</code> file with inline <code>$E = mc^2$</code> or display{" "}
        <code>$$ … $$</code> math.
      </p>
    </div>
  );
}
