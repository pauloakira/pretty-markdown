import { describe, expect, it } from "vitest";
import {
  createMarkdownDocument,
  createPdfDocument,
  documentKindForPath,
  hasPdfSignature,
  isMarkdown,
  PDF_HEADER_WINDOW,
} from "./Document";

const bytes = (text: string, padding = 0) =>
  new Uint8Array([...new Array<number>(padding).fill(0x20), ...new TextEncoder().encode(text)]);

describe("Document", () => {
  it("picks the kind by extension, case-insensitively", () => {
    expect(documentKindForPath("/papers/a.pdf")).toBe("pdf");
    expect(documentKindForPath("C:\\papers\\A.PDF")).toBe("pdf");
    expect(documentKindForPath("/notes/a.md")).toBe("markdown");
    expect(documentKindForPath("/notes/pdf-notes.md")).toBe("markdown");
    expect(documentKindForPath("/notes/README")).toBe("markdown");
  });

  it("creates both kinds with a display name from the path", () => {
    const md = createMarkdownDocument("/n/intro.md", "# Hi");
    const pdf = createPdfDocument("/p/paper.pdf");
    expect(md).toEqual({ kind: "markdown", path: "/n/intro.md", name: "intro.md", content: "# Hi" });
    expect(pdf).toEqual({ kind: "pdf", path: "/p/paper.pdf", name: "paper.pdf" });
    expect(isMarkdown(md)).toBe(true);
    expect(isMarkdown(pdf)).toBe(false);
  });

  describe("hasPdfSignature", () => {
    it("finds %PDF- at the start or anywhere in the first 1024 bytes", () => {
      expect(hasPdfSignature(bytes("%PDF-1.7\n%âãÏÓ"))).toBe(true);
      expect(hasPdfSignature(bytes("%PDF-2.0", 500))).toBe(true);
      expect(hasPdfSignature(bytes("%PDF-1.4", PDF_HEADER_WINDOW - 5))).toBe(true); // ends at the edge
    });

    it("rejects files without it, a header past the window, and short input", () => {
      expect(hasPdfSignature(bytes("# Not a PDF"))).toBe(false);
      expect(hasPdfSignature(bytes("%PDF-1.4", PDF_HEADER_WINDOW - 4))).toBe(false); // spills past
      expect(hasPdfSignature(bytes("%PDF"))).toBe(false);
      expect(hasPdfSignature(new Uint8Array())).toBe(false);
    });
  });
});
