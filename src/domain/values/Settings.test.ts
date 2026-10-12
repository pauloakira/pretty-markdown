import { describe, expect, it } from "vitest";
import {
  clampSettings,
  CONTENTS_WIDTH,
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
    const clamped = clampSettings({ ...defaultSettings, readingWidthRem: 999, fontScalePct: 5, theme: "dark" });
    expect(clamped.readingWidthRem).toBe(READING_WIDTH.max);
    expect(clamped.fontScalePct).toBe(FONT_SCALE.min);
  });

  it("rounds and coerces invalid numbers", () => {
    const clamped = clampSettings({
      ...defaultSettings,
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

  it("keeps a palette highlight colour and falls back on anything else", () => {
    expect(defaultSettings.pdfHighlightColor).toBe("yellow");
    expect(clampSettings({ ...defaultSettings, pdfHighlightColor: "pink" }).pdfHighlightColor).toBe("pink");
    const bogus = { ...defaultSettings, pdfHighlightColor: "purple" } as unknown as Parameters<
      typeof clampSettings
    >[0];
    expect(clampSettings(bogus).pdfHighlightColor).toBe("yellow");
  });

  it("keeps the contents sidebar closed by default, at a width within range", () => {
    expect(defaultSettings.contentsOpen).toBe(false);
    expect(clampSettings({ ...defaultSettings, contentsOpen: true }).contentsOpen).toBe(true);
    expect(clampSettings({ ...defaultSettings, contentsWidthPx: 5000 }).contentsWidthPx).toBe(CONTENTS_WIDTH.max);
    const bogus = { ...defaultSettings, contentsOpen: "yes" } as unknown as Parameters<typeof clampSettings>[0];
    expect(clampSettings(bogus).contentsOpen).toBe(false);
  });
});
