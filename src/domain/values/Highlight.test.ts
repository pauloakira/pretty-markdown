import { describe, expect, it } from "vitest";
import { highlightColorList, highlightHex, isHighlightColor } from "./Highlight";

describe("highlight colours", () => {
  it("recognises the palette's names only", () => {
    expect(isHighlightColor("green")).toBe(true);
    expect(isHighlightColor("purple")).toBe(false);
    expect(isHighlightColor(undefined)).toBe(false);
  });

  it("maps a name to its hex value", () => {
    expect(highlightHex("yellow")).toBe("#FFFF98");
    expect(highlightHex("blue")).toBe("#80EBFF");
  });

  it("lists every colour for pdf.js, the chosen one first", () => {
    expect(highlightColorList("blue")).toBe(
      "blue=#80EBFF,yellow=#FFFF98,green=#53FFBC,pink=#FFCBE6,red=#FF4F5F",
    );
    expect(highlightColorList("yellow").startsWith("yellow=#FFFF98,green=")).toBe(true);
  });
});
