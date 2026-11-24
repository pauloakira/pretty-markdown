import { describe, expect, it } from "vitest";
import {
  initialNotesPanel,
  initialPdfView,
  normalizeNotesPanel,
  parseNotesPanel,
  normalizePdfView,
  parsePdfView,
  pinchedPdfZoom,
  stepPdfZoom,
  type PdfView,
} from "./ViewState";

describe("PdfView", () => {
  it("leaves a valid view untouched (same reference)", () => {
    const view: PdfView = { page: 3, pageOffset: 0.4, zoom: 1.25 };
    expect(normalizePdfView(view)).toBe(view);
    expect(normalizePdfView(initialPdfView)).toBe(initialPdfView);
  });

  it("clamps page, offset and zoom into range", () => {
    expect(normalizePdfView({ page: 0, pageOffset: -1, zoom: 0.01 })).toEqual({
      page: 1,
      pageOffset: 0,
      zoom: 0.25,
    });
    expect(normalizePdfView({ page: 7.8, pageOffset: 3, zoom: 99 })).toEqual({
      page: 7,
      pageOffset: 1,
      zoom: 4,
    });
    expect(normalizePdfView({ page: Number.NaN, pageOffset: Number.NaN, zoom: Number.NaN })).toEqual(
      initialPdfView,
    );
  });

  it("parses untrusted input, defaulting missing fields and rejecting junk", () => {
    expect(parsePdfView({ page: 12, pageOffset: 0.5, zoom: 1.5 })).toEqual({
      page: 12,
      pageOffset: 0.5,
      zoom: 1.5,
    });
    expect(parsePdfView({ page: 2 })).toEqual({ page: 2, pageOffset: 0, zoom: "page-width" });
    expect(parsePdfView({ page: 2, zoom: "huge" })).toEqual({ page: 2, pageOffset: 0, zoom: "page-width" });
    expect(parsePdfView({ pageOffset: 0.5 })).toBeNull();
    expect(parsePdfView("page 3")).toBeNull();
    expect(parsePdfView(undefined)).toBeNull();
  });
});

describe("stepPdfZoom", () => {
  it("steps through the zoom levels from an exact level", () => {
    expect(stepPdfZoom(1, 1)).toBe(1.1);
    expect(stepPdfZoom(1, -1)).toBe(0.9);
  });

  it("moves to the nearest level on that side from an in-between scale", () => {
    expect(stepPdfZoom(1.18, 1)).toBe(1.25);
    expect(stepPdfZoom(1.18, -1)).toBe(1.1);
  });

  it("never steps to a level that's visually the same as the current scale", () => {
    // Fit-width often lands just off a step (here 150.4%): one press must visibly change it.
    expect(stepPdfZoom(1.504, -1)).toBe(1.25);
    expect(stepPdfZoom(1.496, 1)).toBe(1.75);
  });

  it("stays within range at the ends", () => {
    expect(stepPdfZoom(4, 1)).toBe(4);
    expect(stepPdfZoom(0.25, -1)).toBe(0.25);
    expect(stepPdfZoom(9, -1)).toBe(4);
  });
});

describe("NotesPanelView", () => {
  it("starts closed at the default width, and clamps a width into range", () => {
    expect(initialNotesPanel).toEqual({ open: false, widthPx: 460 });
    expect(normalizeNotesPanel(initialNotesPanel)).toBe(initialNotesPanel);
    expect(normalizeNotesPanel({ open: true, widthPx: 10 })).toEqual({ open: true, widthPx: 300 });
    expect(normalizeNotesPanel({ open: true, widthPx: 512.6 })).toEqual({ open: true, widthPx: 513 });
    expect(normalizeNotesPanel({ open: false, widthPx: Number.NaN })).toEqual({ open: false, widthPx: 460 });
  });

  it("parses what the session saved, and rejects anything else", () => {
    expect(parseNotesPanel({ open: true, widthPx: 500 })).toEqual({ open: true, widthPx: 500 });
    expect(parseNotesPanel({ open: false })).toEqual({ open: false, widthPx: 460 });
    expect(parseNotesPanel({ widthPx: 500 })).toBeNull();
    expect(parseNotesPanel("open")).toBeNull();
    expect(parseNotesPanel(null)).toBeNull();
  });
});

describe("pinchedPdfZoom", () => {
  it("keeps the scale a pinch ends on", () => {
    expect(pinchedPdfZoom(1.8, 1.24)).toBe(1.8);
    expect(pinchedPdfZoom(0.7, 1.24)).toBe(0.7);
  });

  it("snaps to Fit width when it ends close to it", () => {
    expect(pinchedPdfZoom(1.24, 1.24)).toBe("page-width");
    expect(pinchedPdfZoom(1.3, 1.24)).toBe("page-width"); // +4.8%
    expect(pinchedPdfZoom(1.18, 1.24)).toBe("page-width"); // -4.8%
  });

  it("doesn't snap a deliberate zoom away from Fit width", () => {
    expect(pinchedPdfZoom(1.35, 1.24)).toBe(1.35); // +8.9%
    expect(pinchedPdfZoom(1.1, 1.24)).toBe(1.1);
  });

  it("stays in range, and doesn't snap without a fit-width scale", () => {
    expect(pinchedPdfZoom(9, 1.24)).toBe(4);
    expect(pinchedPdfZoom(0.1, 1.24)).toBe(0.25);
    expect(pinchedPdfZoom(1.24, null)).toBe(1.24);
  });
});
