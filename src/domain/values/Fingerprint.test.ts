import { describe, expect, it } from "vitest";
import { fingerprint } from "./Fingerprint";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("fingerprint", () => {
  it("is the same for the same bytes", () => {
    expect(fingerprint(bytes(1, 2, 3))).toBe(fingerprint(bytes(1, 2, 3)));
  });

  it("differs when a byte changes", () => {
    expect(fingerprint(bytes(1, 2, 3))).not.toBe(fingerprint(bytes(1, 2, 4)));
  });

  it("differs when bytes are appended", () => {
    expect(fingerprint(bytes(1, 2, 3))).not.toBe(fingerprint(bytes(1, 2, 3, 0)));
  });

  it("includes the length", () => {
    expect(fingerprint(new Uint8Array(0))).toBe("0:811c9dc5");
    expect(fingerprint(bytes(97))).toBe("1:e40c292c"); // FNV-1a("a")
  });
});
