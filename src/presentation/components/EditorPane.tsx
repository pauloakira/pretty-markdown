import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef, type MutableRefObject } from "react";
import { editorHighlighting, editorTheme } from "../editor/editorTheme";

interface EditorPaneProps {
  initialDoc: string;
  onChange: (content: string) => void;
  /** Receives CodeMirror's scroll element, for synced scrolling. */
  scrollRef?: MutableRefObject<HTMLElement | null>;
}

/**
 * Thin React wrapper around a CodeMirror 6 EditorView. The editor is uncontrolled —
 * created once on mount from `initialDoc`; edits flow out through `onChange`. Switching
 * tabs unmounts this (the parent keys it per tab), so editor state is per-tab.
 */
export function EditorPane({ initialDoc, onChange, scrollRef }: EditorPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      doc: initialDoc,
      parent: host,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        editorTheme,
        editorHighlighting,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    if (scrollRef) scrollRef.current = view.scrollDOM;

    return () => {
      if (scrollRef) scrollRef.current = null;
      view.destroy();
    };
    // Create once per mount; the parent remounts via `key` when the tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor-host" ref={hostRef} />;
}
