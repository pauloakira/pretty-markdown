/**
 * The highlighter colours offered for PDFs, as pdf.js names them (its highlight editor is
 * configured with this list). Pale enough that text stays readable under them.
 */
export const HIGHLIGHT_COLORS = [
  { name: "yellow", label: "Yellow", hex: "#FFFF98" },
  { name: "green", label: "Green", hex: "#53FFBC" },
  { name: "blue", label: "Blue", hex: "#80EBFF" },
  { name: "pink", label: "Pink", hex: "#FFCBE6" },
  { name: "red", label: "Red", hex: "#FF4F5F" },
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]["name"];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "yellow";

export function isHighlightColor(value: unknown): value is HighlightColor {
  return HIGHLIGHT_COLORS.some((c) => c.name === value);
}

/** The colour's hex value, e.g. "#FFFF98". */
export function highlightHex(color: HighlightColor): string {
  return (HIGHLIGHT_COLORS.find((c) => c.name === color) ?? HIGHLIGHT_COLORS[0]).hex;
}

/** All colours as pdf.js's `name=#hex,…` list, starting with `first` (its default). */
export function highlightColorList(first: HighlightColor): string {
  const ordered = [
    ...HIGHLIGHT_COLORS.filter((c) => c.name === first),
    ...HIGHLIGHT_COLORS.filter((c) => c.name !== first),
  ];
  return ordered.map((c) => `${c.name}=${c.hex}`).join(",");
}
