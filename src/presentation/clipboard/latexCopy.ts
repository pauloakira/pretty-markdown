/**
 * Copy-as-LaTeX. Two cases:
 *
 * 1. A selection entirely within one formula → copy that formula's LaTeX source
 *    (from `data-tex`), with no delimiters.
 * 2. A selection mixing prose and math → rebuild the text, replacing each rendered
 *    formula with its LaTeX source wrapped in `$…$` / `$$…$$`. This also fixes KaTeX's
 *    copy duplication (it renders a hidden MathML copy alongside the visual HTML, so a
 *    default copy yields "a a", "M M", …); replacing the whole formula drops both.
 *
 * A selection with no math is left to the browser's normal copy.
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

/**
 * Plain text for a mixed selection, with rendered math replaced by its LaTeX source.
 * Returns null when the selection contains no whole formula (let the browser copy).
 */
export function mixedSelectionText(range: Range): string | null {
  const fragment = range.cloneContents();
  const maths = fragment.querySelectorAll<HTMLElement>(".pm-math");
  if (maths.length === 0) return null;

  maths.forEach((el) => {
    const tex = (el.dataset.tex ?? "").trim();
    const block = el.classList.contains("pm-math--block");
    el.replaceWith(document.createTextNode(block ? `\n$$\n${tex}\n$$\n` : `$${tex}$`));
  });
  return fragment.textContent ?? "";
}

/** Install the global copy handler. Returns a disposer that removes it. */
export function installLatexCopy(target: Document = document): () => void {
  const onCopy = (event: ClipboardEvent) => {
    const selection = target.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const single = latexForSelection(selection);
    if (single !== null) {
      event.clipboardData?.setData("text/plain", single);
      event.preventDefault();
      return;
    }

    const text = mixedSelectionText(selection.getRangeAt(0));
    if (text !== null) {
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
    }
  };

  target.addEventListener("copy", onCopy);
  return () => target.removeEventListener("copy", onCopy);
}
