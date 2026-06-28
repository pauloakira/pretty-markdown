import { Reader } from "./presentation/components/Reader";
import { Toolbar } from "./presentation/components/Toolbar";
import { Welcome } from "./presentation/components/Welcome";
import { useDocument } from "./presentation/hooks/useDocument";

export default function App() {
  const { document, html, error, busy, open } = useDocument();

  return (
    <div className="app">
      <Toolbar title={document?.name ?? null} busy={busy} onOpen={open} />
      <main className="app__content">
        {error && <div className="banner banner--error">{error}</div>}
        {document ? <Reader html={html} /> : <Welcome onOpen={open} />}
      </main>
    </div>
  );
}
