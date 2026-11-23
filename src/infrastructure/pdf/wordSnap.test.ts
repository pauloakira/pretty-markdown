import { describe, expect, it } from "vitest";
import { snapSelectionToWords, widenToWords } from "./wordSnap";

const cut = (text: string, start: number, end: number) => {
  const r = widenToWords(text, start, end);
  return text.slice(r.start, r.end);
};

describe("widenToWords", () => {
  const text = "point evaluations are available on the grid points. Baker-Campbell don't";
  it("takes the whole word when an end falls inside one", () => {
    expect(cut(text, text.indexOf("grid"), text.indexOf("points") + 2)).toBe("grid points");
    expect(cut(text, text.indexOf("valuations"), text.indexOf(" are"))).toBe("evaluations");
  });
  it("leaves ends that fall between words, and punctuation, alone", () => {
    expect(cut(text, text.indexOf("are"), text.indexOf(" on"))).toBe("are available");
    expect(cut(text, text.indexOf("grid"), text.indexOf(".") + 1)).toBe("grid points.");
  });
  it("keeps hyphenated words and contractions whole", () => {
    expect(cut(text, text.indexOf("Camp"), text.indexOf("don") + 2)).toBe("Baker-Campbell don't");
  });
});

describe("snapSelectionToWords", () => {
  it("widens the document's selection, keeping its direction", () => {
    document.body.innerHTML = "<span>In subsection 2.1, we describe</span>";
    const node = document.querySelector("span")?.firstChild as Text;
    const selection = document.getSelection();
    selection?.setBaseAndExtent(node, 3, node, 20); // "subsection 2.1, w"
    snapSelectionToWords(selection);
    expect(String(selection)).toBe("subsection 2.1, we");

    selection?.setBaseAndExtent(node, 26, node, 5); // backwards, "bsection 2.1, we des"
    snapSelectionToWords(selection);
    expect(String(selection)).toBe("subsection 2.1, we describe");
    expect(selection?.anchorOffset).toBe(30); // the anchor stays at the far end
  });
});
