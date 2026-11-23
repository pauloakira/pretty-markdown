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

  it("can print through the system sheet, cleaning up when it closes (iPadOS)", async () => {
    let closeSheet = () => {};
    const printed: string[] = [];
    const exporter = new PrintDocumentExporter(
      (title) =>
        new Promise<void>((resolve) => {
          printed.push(title);
          closeSheet = resolve;
        }),
    );
    const exporting = exporter.exportPdf({ title: "Paper.md", html: "<p>y</p>" });
    await Promise.resolve();
    expect(printed).toEqual(["Paper.md"]);
    expect(document.getElementById("print-root")?.innerHTML).toContain("<p>y</p>"); // while the sheet is open
    closeSheet();
    await exporting;
    expect(document.getElementById("print-root")).toBeNull();
  });
});
