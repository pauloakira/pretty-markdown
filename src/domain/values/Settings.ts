import { DEFAULT_HIGHLIGHT_COLOR, isHighlightColor, type HighlightColor } from "./Highlight";

/** Which palette to use: follow the OS, or force light/dark. */
export type ThemePreference = "system" | "light" | "dark";

export const THEMES: readonly ThemePreference[] = ["system", "light", "dark"];

/**
 * User-adjustable reader settings. Applied live as CSS variables and persisted across
 * sessions. Kept small and flat so it's trivial to serialize and extend.
 */
export interface Settings {
  /** Max content width of the reader, in rem (controls the side margins). */
  readingWidthRem: number;
  /** Font size as a percentage of the base reading size (100 = default). */
  fontScalePct: number;
  /** Palette preference; "system" follows the OS appearance. */
  theme: ThemePreference;
  /** The PDF highlighter's colour: the last one picked. */
  pdfHighlightColor: HighlightColor;
  /** Whether the contents sidebar is open (one setting for every document). */
  contentsOpen: boolean;
  /** The contents sidebar's width, in px (dragged on the Mac). */
  contentsWidthPx: number;
}

export const READING_WIDTH = { min: 32, max: 80, step: 2, default: 46 } as const;
export const FONT_SCALE = { min: 80, max: 150, step: 5, default: 100 } as const;
export const CONTENTS_WIDTH = { min: 180, max: 480, default: 260 } as const;

export const defaultSettings: Settings = {
  readingWidthRem: READING_WIDTH.default,
  fontScalePct: FONT_SCALE.default,
  theme: "system",
  pdfHighlightColor: DEFAULT_HIGHLIGHT_COLOR,
  contentsOpen: false,
  contentsWidthPx: CONTENTS_WIDTH.default,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Coerce arbitrary input (e.g. from storage) into valid, in-range settings. */
export function clampSettings(s: Settings): Settings {
  return {
    readingWidthRem: clamp(Math.round(s.readingWidthRem), READING_WIDTH.min, READING_WIDTH.max),
    fontScalePct: clamp(Math.round(s.fontScalePct), FONT_SCALE.min, FONT_SCALE.max),
    theme: THEMES.includes(s.theme) ? s.theme : defaultSettings.theme,
    pdfHighlightColor: isHighlightColor(s.pdfHighlightColor)
      ? s.pdfHighlightColor
      : defaultSettings.pdfHighlightColor,
    contentsOpen: typeof s.contentsOpen === "boolean" ? s.contentsOpen : defaultSettings.contentsOpen,
    contentsWidthPx: clamp(Math.round(s.contentsWidthPx), CONTENTS_WIDTH.min, CONTENTS_WIDTH.max),
  };
}
