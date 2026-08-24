import { describe, expect, it } from "vitest";
import {
  clampSettings,
  defaultSettings,
  FONT_SCALE,
  READING_WIDTH,
} from "./Settings";

describe("Settings", () => {
  it("has defaults within range", () => {
    expect(defaultSettings.readingWidthRem).toBe(READING_WIDTH.default);
    expect(defaultSettings.fontScalePct).toBe(FONT_SCALE.default);
  });

  it("clamps out-of-range values", () => {
    const clamped = clampSettings({ readingWidthRem: 999, fontScalePct: 5, theme: "dark" });
    expect(clamped.readingWidthRem).toBe(READING_WIDTH.max);
    expect(clamped.fontScalePct).toBe(FONT_SCALE.min);
  });

  it("rounds and coerces invalid numbers", () => {
    const clamped = clampSettings({
      readingWidthRem: 46.7,
      fontScalePct: Number.NaN,
      theme: "system",
    });
    expect(clamped.readingWidthRem).toBe(47);
    expect(clamped.fontScalePct).toBe(FONT_SCALE.min);
  });

  it("keeps a valid theme and falls back on an unknown one", () => {
    expect(clampSettings({ ...defaultSettings, theme: "dark" }).theme).toBe("dark");
    // e.g. a value from an older/corrupt stored payload
    const bogus = { ...defaultSettings, theme: "solarized" } as unknown as Parameters<
      typeof clampSettings
    >[0];
    expect(clampSettings(bogus).theme).toBe("system");
  });
});
