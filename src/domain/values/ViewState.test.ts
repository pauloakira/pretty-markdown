import { describe, expect, it } from "vitest";
import { initialPdfView, normalizePdfView, parsePdfView, stepPdfZoom, type PdfView } from "./ViewState";

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
