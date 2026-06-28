interface ToolbarProps {
  title: string | null;
  busy: boolean;
  onOpen: () => void;
}

export function Toolbar({ title, busy, onOpen }: ToolbarProps) {
  return (
    <header className="toolbar">
      <button className="toolbar__btn" onClick={onOpen} disabled={busy}>
        {busy ? "Opening…" : "Open"}
      </button>
      <span className="toolbar__title">{title ?? "pretty-markdown"}</span>
    </header>
  );
}
