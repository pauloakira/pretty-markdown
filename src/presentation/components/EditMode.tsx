import { useCallback, useEffect, useRef, useState } from "react";
import type { MarkdownDocument } from "../../domain/entities/Document";
import { EditorPane } from "./EditorPane";
import { Preview } from "./Preview";

interface EditModeProps {
  doc: MarkdownDocument;
  renderMarkdown: (src: string) => string;
  onContentChange: (content: string) => void;
}

/**
 * Split-pane edit mode: CodeMirror source on the left, live preview on the right.
 * The preview re-renders on a short debounce to keep typing smooth, and the two panes
 * scroll in sync (proportional).
 */
export function EditMode({ doc, renderMarkdown, onContentChange }: EditModeProps) {
  const [previewHtml, setPreviewHtml] = useState(() => renderMarkdown(doc.content));
  const editorScrollRef = useRef<HTMLElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const renderTimer = useRef<number | null>(null);

  const handleChange = useCallback(
    (content: string) => {
      onContentChange(content);
      if (renderTimer.current) window.clearTimeout(renderTimer.current);
      renderTimer.current = window.setTimeout(() => {
        setPreviewHtml(renderMarkdown(content));
      }, 120);
    },
    [onContentChange, renderMarkdown],
  );

  useEffect(
    () => () => {
      if (renderTimer.current) window.clearTimeout(renderTimer.current);
    },
    [],
  );

  // Proportional synced scrolling. Child effects (EditorPane/Preview) run first, so both
  // scroll elements are wired by the time this runs.
  //
  // Each programmatic scroll produces an "echo" scroll event on the target pane. We tag
  // the target so its echo is swallowed, rather than gating on a shared flag — that way
  // the pane the user is actively scrolling is never suppressed (which previously caused
  // flicker, dropped frames, and upward drift when stopping).
  useEffect(() => {
    const editor = editorScrollRef.current;
    const preview = previewScrollRef.current;
    if (!editor || !preview) return;

    const echoes = new Set<HTMLElement>();

    const link = (from: HTMLElement, to: HTMLElement) => () => {
      if (echoes.has(from)) {
        echoes.delete(from); // this scroll was one we triggered — don't bounce it back
        return;
      }
      const max = Math.max(1, from.scrollHeight - from.clientHeight);
      const target = (from.scrollTop / max) * (to.scrollHeight - to.clientHeight);
      if (Math.abs(to.scrollTop - target) < 1) return; // no move → no echo to suppress
      echoes.add(to);
      to.scrollTop = target;
    };

    const onEditorScroll = link(editor, preview);
    const onPreviewScroll = link(preview, editor);
    editor.addEventListener("scroll", onEditorScroll, { passive: true });
    preview.addEventListener("scroll", onPreviewScroll, { passive: true });
    return () => {
      editor.removeEventListener("scroll", onEditorScroll);
      preview.removeEventListener("scroll", onPreviewScroll);
    };
  }, []);

  return (
    <div className="editmode">
      <div className="editmode__pane editmode__pane--editor">
        <EditorPane
          initialDoc={doc.content}
          onChange={handleChange}
          scrollRef={editorScrollRef}
        />
      </div>
      <div className="editmode__pane editmode__pane--preview">
        <Preview html={previewHtml} scrollRef={previewScrollRef} />
      </div>
    </div>
  );
}
