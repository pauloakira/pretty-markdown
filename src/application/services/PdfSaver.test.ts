import { describe, expect, it } from "vitest";
import type { FileWriter } from "../../domain/ports/FileSystem";
import { err, ok, type Result } from "../../domain/values/Result";
import { PdfSaver } from "./PdfSaver";

class FakeWriter implements FileWriter {
  public files = new Map<string, Uint8Array>();
  constructor(private readonly result: Result<void> = ok(undefined)) {}
  async writeTextFile(): Promise<Result<void>> {
    return ok(undefined);
  }
  async writeBytes(path: string, bytes: Uint8Array): Promise<Result<void>> {
    if (this.result.ok) this.files.set(path, bytes);
    return this.result;
  }
}

const pdf = (...values: number[]) => new Uint8Array([0x25, 0x50, 0x44, 0x46, ...values]);

describe("PdfSaver", () => {
  it("writes the bytes to the file", async () => {
    const writer = new FakeWriter();
    const saver = new PdfSaver(writer);
    const result = await saver.save("/papers/a.pdf", pdf(1, 2));
    expect(result.ok).toBe(true);
    expect(writer.files.get("/papers/a.pdf")).toEqual(pdf(1, 2));
  });

  it("recognises its own write, and nothing else", async () => {
    const saver = new PdfSaver(new FakeWriter());
    await saver.save("/papers/a.pdf", pdf(1, 2));
    expect(saver.isOwnWrite("/papers/a.pdf", pdf(1, 2))).toBe(true);
    expect(saver.isOwnWrite("/papers/a.pdf", pdf(1, 3))).toBe(false); // changed by another app
    expect(saver.isOwnWrite("/papers/b.pdf", pdf(1, 2))).toBe(false); // never saved
  });

  it("only remembers the latest save", async () => {
    const saver = new PdfSaver(new FakeWriter());
    await saver.save("/papers/a.pdf", pdf(1));
    await saver.save("/papers/a.pdf", pdf(1, 2));
    expect(saver.isOwnWrite("/papers/a.pdf", pdf(1))).toBe(false);
    expect(saver.isOwnWrite("/papers/a.pdf", pdf(1, 2))).toBe(true);
  });

  it("doesn't claim a write that failed", async () => {
    const saver = new PdfSaver(new FakeWriter(err("Failed to write '/papers/a.pdf': read-only")));
    const result = await saver.save("/papers/a.pdf", pdf(1));
    expect(result).toEqual(err("Failed to write '/papers/a.pdf': read-only"));
    expect(saver.isOwnWrite("/papers/a.pdf", pdf(1))).toBe(false);
  });

  it("forgets a file", async () => {
    const saver = new PdfSaver(new FakeWriter());
    await saver.save("/papers/a.pdf", pdf(1));
    saver.forget("/papers/a.pdf");
    expect(saver.isOwnWrite("/papers/a.pdf", pdf(1))).toBe(false);
  });
});
