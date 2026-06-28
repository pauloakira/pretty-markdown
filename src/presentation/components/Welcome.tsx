interface WelcomeProps {
  onOpen: () => void;
}

export function Welcome({ onOpen }: WelcomeProps) {
  return (
    <div className="welcome">
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
