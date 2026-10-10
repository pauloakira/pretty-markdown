import { describe, expect, it } from "vitest";
import { wordBounds } from "./textHit";

const word = (text: string, index: number) => {
  const bounds = wordBounds(text, index);
  return bounds ? text.slice(...bounds) : null;
};

describe("wordBounds", () => {
  const line = "We consider the discretization of a boundary value problem";

  it("finds the word around a character", () => {
    expect(word(line, 0)).toBe("We");
    expect(word(line, 1)).toBe("We");
    expect(word(line, 5)).toBe("consider");
    expect(word(line, line.length - 1)).toBe("problem");
  });

  it("finds nothing on spaces and punctuation", () => {
    expect(word(line, 2)).toBeNull();
    expect(word("Abstract. We", 8)).toBeNull();
    expect(word("x", 5)).toBeNull();
    expect(word("x", -1)).toBeNull();
  });

  it("stops at punctuation and hyphens", () => {
    expect(word("Abstract. We", 3)).toBe("Abstract");
    expect(word("second-order elliptic", 2)).toBe("second");
    expect(word("second-order elliptic", 9)).toBe("order");
    expect(word("[59] the problem", 1)).toBe("59");
  });

  it("handles accents, apostrophes and math letters", () => {
    expect(word("L. Beirão da Veiga", 6)).toBe("Beirão");
    expect(word("the method's accuracy", 6)).toBe("method's");
    expect(word("'quoted' text", 3)).toBe("quoted");
    expect(word("the L² projection", 4)).toBe("L²");
  });
});
