import { afterEach, describe, expect, it } from "vitest";
import { PrintDocumentExporter } from "./PrintDocumentExporter";

const originalPrint = window.print;

afterEach(() => {
  window.print = originalPrint;
  document.getElementById("print-root")?.remove();
});

describe("PrintDocumentExporter", () => {
  it("injects the rendered document, prints, then cleans up", async () => {
    let htmlDuringPrint = "";
    let titleDuringPrint = "";
    window.print = () => {
      const root = document.getElementById("print-root");
      htmlDuringPrint = root?.innerHTML ?? "";
      titleDuringPrint = document.title;
      window.dispatchEvent(new Event("afterprint")); // simulate the print finishing
    };

    const before = document.title;
    await new PrintDocumentExporter().exportPdf({ title: "Paper.md", html: "<h1>Hi</h1>" });

    expect(htmlDuringPrint).toContain("<h1>Hi</h1>");
    expect(titleDuringPrint).toBe("Paper.md"); // title set for the default filename
    expect(document.getElementById("print-root")).toBeNull(); // cleaned up after afterprint
    expect(document.title).toBe(before); // restored
  });

  it("still cleans up if printing throws", async () => {
    window.print = () => {
      throw new Error("not implemented");
    };
    await new PrintDocumentExporter().exportPdf({ title: "x", html: "<p>y</p>" });
    expect(document.getElementById("print-root")).toBeNull();
  });
});
