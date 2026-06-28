/**
 * Copy-as-LaTeX: when the user copies a selection that lies entirely within a single
 * rendered formula, replace the clipboard text with the formula's source LaTeX (stored
 * in `data-tex` by the markdown math plugin) instead of the rendered glyphs.
 *
 * If the selection spans more than one formula or mixes math with prose, we leave the
 * default copy behavior untouched.
 */

/** The nearest enclosing `.pm-math` element for a node, or null. */
export function closestMath(node: Node | null): HTMLElement | null {
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  return el?.closest<HTMLElement>(".pm-math") ?? null;
}

/** The source LaTeX if a selection is wholly inside one formula, else null. */
export function latexForSelection(selection: Selection | null): string | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const anchor = closestMath(selection.anchorNode);
  const focus = closestMath(selection.focusNode);
  if (anchor && anchor === focus) return anchor.dataset.tex ?? null;
  return null;
}

/** Install the global copy handler. Returns a disposer that removes it. */
export function installLatexCopy(target: Document = document): () => void {
  const onCopy = (event: ClipboardEvent) => {
    const tex = latexForSelection(target.getSelection());
    if (tex == null) return;
    event.clipboardData?.setData("text/plain", tex);
    event.preventDefault();
  };
  target.addEventListener("copy", onCopy);
  return () => target.removeEventListener("copy", onCopy);
}
