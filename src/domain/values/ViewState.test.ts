import { describe, expect, it } from "vitest";
import { initialPdfView, normalizePdfView, parsePdfView, type PdfView } from "./ViewState";

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
