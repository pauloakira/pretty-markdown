interface WelcomeProps {
  onOpen: () => void;
  onOpenSettings: () => void;
}

export function Welcome({ onOpen, onOpenSettings }: WelcomeProps) {
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
      <p className="welcome__hint">
        Try a <code>.md</code> file with inline <code>$E = mc^2$</code> or display{" "}
        <code>$$ … $$</code> math.
      </p>
    </div>
  );
}
