import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/**
 * CodeMirror theme wired to the app's CSS variables, so the editor follows the same
 * light/dark palette as the rest of the UI.
 */
export const editorTheme: Extension = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--bg)",
    color: "var(--fg)",
    fontSize: "0.95rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    padding: "0.5rem 0",
  },
  ".cm-content": { caretColor: "var(--accent)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  ".cm-gutters": {
    backgroundColor: "var(--bg-elevated)",
    color: "var(--fg-muted)",
    border: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 32%, transparent)",
  },
  ".cm-panels": {
    backgroundColor: "var(--bg-elevated)",
    color: "var(--fg)",
  },
});

const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--accent)", fontWeight: "bold" },
  { tag: t.strong, fontWeight: "bold", color: "var(--fg)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: t.url, color: "var(--fg-muted)" },
  { tag: t.monospace, fontFamily: "var(--font-mono)", color: "var(--accent)" },
  { tag: t.quote, color: "var(--fg-muted)", fontStyle: "italic" },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: "var(--fg-muted)" },
  { tag: t.comment, color: "var(--fg-muted)" },
  { tag: t.keyword, color: "var(--accent)" },
]);

export const editorHighlighting: Extension = syntaxHighlighting(markdownHighlight);
