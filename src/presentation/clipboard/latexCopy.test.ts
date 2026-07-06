import { describe, expect, it } from "vitest";
import { closestMath, latexForSelection, mixedSelectionText } from "./latexCopy";

/** Render markup into a detached container for querying. */
function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

function rangeOver(root: Node): Range {
  const range = document.createRange();
  range.selectNodeContents(root);
  return range;
}

/** Build a minimal Selection-like object over two nodes. */
function selectionOf(anchor: Node | null, focus: Node | null): Selection {
  return {
    rangeCount: anchor ? 1 : 0,
    isCollapsed: false,
    anchorNode: anchor,
    focusNode: focus,
  } as Selection;
}

describe("latexCopy", () => {
  it("finds the enclosing formula source from a descendant node", () => {
    const root = mount('<p>text <span class="pm-math" data-tex="E = mc^2"><i>glyph</i></span></p>');
    const glyph = root.querySelector("i")!;
    expect(closestMath(glyph)?.dataset.tex).toBe("E = mc^2");
  });

  it("returns the LaTeX when a selection is wholly inside one formula", () => {
    const root = mount('<span class="pm-math" data-tex="\\int x\\,dx"><i>a</i><i>b</i></span>');
    const [a, b] = Array.from(root.querySelectorAll("i"));
    expect(latexForSelection(selectionOf(a, b))).toBe("\\int x\\,dx");
  });

  it("returns null when the selection spans two formulas", () => {
    const root = mount(
      '<span class="pm-math" data-tex="x"><i>x</i></span>' +
        '<span class="pm-math" data-tex="y"><i>y</i></span>',
    );
    const [x, y] = Array.from(root.querySelectorAll("i"));
    expect(latexForSelection(selectionOf(x, y))).toBeNull();
  });

  it("returns null for a selection outside any formula", () => {
    const root = mount("<p><i>plain</i></p>");
    const plain = root.querySelector("i")!;
    expect(latexForSelection(selectionOf(plain, plain))).toBeNull();
  });

  it("ignores collapsed/empty selections", () => {
    expect(latexForSelection(null)).toBeNull();
    expect(latexForSelection(selectionOf(null, null))).toBeNull();
  });
});

describe("mixedSelectionText", () => {
  it("replaces inline formulas with their $LaTeX$ source, once each", () => {
    const root = mount(
      '<p>Let <span class="pm-math" data-tex="a">RENDERED</span> be continuous with ' +
        'constant <span class="pm-math" data-tex="M">RENDERED</span>.</p>',
    );
    expect(mixedSelectionText(rangeOver(root))).toBe(
      "Let $a$ be continuous with constant $M$.",
    );
  });

  it("drops KaTeX's duplicated MathML instead of copying it twice", () => {
    // Mimic KaTeX output: a hidden MathML copy + the visual HTML inside .pm-math.
    const root = mount(
      'x <span class="pm-math" data-tex="\\alpha">' +
        '<span class="katex"><span class="katex-mathml">α</span>' +
        '<span class="katex-html">α</span></span></span> y',
    );
    expect(mixedSelectionText(rangeOver(root))).toBe("x $\\alpha$ y");
  });

  it("wraps display math in $$…$$", () => {
    const root = mount('a <span class="pm-math pm-math--block" data-tex="\\int x">R</span> b');
    expect(mixedSelectionText(rangeOver(root))).toBe("a \n$$\n\\int x\n$$\n b");
  });

  it("returns null when the selection has no math (browser copies normally)", () => {
    expect(mixedSelectionText(rangeOver(mount("<p>just prose</p>")))).toBeNull();
  });
});
