import { describe, expect, it } from "vitest";
import type { FileReader, FileWriter } from "../../domain/ports/FileSystem";
import { err, ok, type Result } from "../../domain/values/Result";
import { CHANGED_ON_DISK, PdfSaver } from "./PdfSaver";

/** An in-memory disk that the saver both reads and writes. */
class FakeDisk implements FileReader, FileWriter {
  files = new Map<string, Uint8Array>();
  failWrites: string | null = null;
  async readTextFile(): Promise<Result<string>> {
    return err("not used");
  }
  async readBytes(path: string): Promise<Result<Uint8Array>> {
    const bytes = this.files.get(path);
    return bytes ? ok(bytes) : err(`Failed to read '${path}': No such file`);
  }
  async writeTextFile(): Promise<Result<void>> {
    return ok(undefined);
  }
  async writeBytes(path: string, bytes: Uint8Array): Promise<Result<void>> {
    if (this.failWrites) return err(this.failWrites);
    this.files.set(path, bytes);
    return ok(undefined);
  }
}

const pdf = (...values: number[]) => new Uint8Array([0x25, 0x50, 0x44, 0x46, ...values]);
const PATH = "/papers/a.pdf";

function setup(initial = pdf(1)) {
  const disk = new FakeDisk();
  disk.files.set(PATH, initial);
  const saver = new PdfSaver(disk, disk);
  saver.opened(PATH, initial);
  return { disk, saver };
}

describe("PdfSaver", () => {
  it("writes the bytes to the file", async () => {
    const { disk, saver } = setup();
    expect(await saver.save(PATH, pdf(1, 2))).toEqual(ok(undefined));
    expect(disk.files.get(PATH)).toEqual(pdf(1, 2));
  });

  it("saves again after its own save", async () => {
    const { disk, saver } = setup();
    await saver.save(PATH, pdf(1, 2));
    expect(await saver.save(PATH, pdf(1, 2, 3))).toEqual(ok(undefined));
    expect(disk.files.get(PATH)).toEqual(pdf(1, 2, 3));
  });

  it("refuses to save over a file another app changed", async () => {
    const { disk, saver } = setup();
    disk.files.set(PATH, pdf(9)); // e.g. LaTeX recompiled it, or iCloud synced a new version
    expect(await saver.save(PATH, pdf(1, 2))).toEqual(err(CHANGED_ON_DISK));
    expect(disk.files.get(PATH)).toEqual(pdf(9)); // untouched
  });

  it("reports a file that disappeared", async () => {
    const { disk, saver } = setup();
    disk.files.delete(PATH);
    const result = await saver.save(PATH, pdf(1, 2));
    expect(result).toEqual(err("Couldn't save the highlights: Failed to read '/papers/a.pdf': No such file"));
  });

  it("reports a failed write, and still expects the old content", async () => {
    const { disk, saver } = setup();
    disk.failWrites = "Failed to write '/papers/a.pdf': Permission denied";
    expect(await saver.save(PATH, pdf(1, 2))).toEqual(
      err("Couldn't save the highlights: Failed to write '/papers/a.pdf': Permission denied"),
    );
    disk.failWrites = null;
    expect(await saver.save(PATH, pdf(1, 2))).toEqual(ok(undefined));
  });

  it("recognises what it loaded or saved, and nothing else", async () => {
    const { saver } = setup();
    expect(saver.isOwnWrite(PATH, pdf(1))).toBe(true);
    await saver.save(PATH, pdf(1, 2));
    expect(saver.isOwnWrite(PATH, pdf(1, 2))).toBe(true);
    expect(saver.isOwnWrite(PATH, pdf(1))).toBe(false);
    expect(saver.isOwnWrite("/papers/b.pdf", pdf(1, 2))).toBe(false);
  });

  it("forgets a file", async () => {
    const { saver } = setup();
    saver.forget(PATH);
    expect(saver.isOwnWrite(PATH, pdf(1))).toBe(false);
  });

  it("lets a reopen wait for a closing viewer's last save", async () => {
    const { saver } = setup();
    let finish = () => {};
    const lastSave = new Promise<void>((resolve) => (finish = resolve));
    saver.finishLater(PATH, lastSave);

    let reopened = false;
    const reopen = saver.settled(PATH).then(() => (reopened = true));
    await Promise.resolve();
    expect(reopened).toBe(false);
    finish();
    await reopen;
    expect(reopened).toBe(true);
    await saver.settled("/papers/other.pdf"); // nothing pending: resolves at once
  });
});
