import { beforeEach, describe, expect, it } from "vitest";
import { defaultSettings } from "../../domain/values/Settings";
import { LocalStorageSettingsRepository } from "./LocalStorageSettingsRepository";

describe("LocalStorageSettingsRepository", () => {
  const repo = new LocalStorageSettingsRepository();

  beforeEach(() => localStorage.clear());

  it("returns null when nothing is saved", () => {
    expect(repo.load()).toBeNull();
  });

  it("round-trips saved settings", () => {
    const settings = { readingWidthRem: 60, fontScalePct: 120, theme: "dark", pdfHighlightColor: "green" } as const;
    repo.save(settings);
    expect(repo.load()).toEqual(settings);
  });

  it("backfills the highlight colour for settings saved before it existed", () => {
    localStorage.setItem(
      "pretty-markdown.settings.v1",
      JSON.stringify({ readingWidthRem: 60, fontScalePct: 120, theme: "dark" }),
    );
    expect(repo.load()?.pdfHighlightColor).toBe("yellow");
  });

  it("clamps and backfills partial/out-of-range stored data", () => {
    localStorage.setItem("pretty-markdown.settings.v1", JSON.stringify({ readingWidthRem: 999 }));
    const loaded = repo.load();
    expect(loaded?.readingWidthRem).toBe(80);
    expect(loaded?.fontScalePct).toBe(defaultSettings.fontScalePct);
  });

  it("returns null on corrupt JSON", () => {
    localStorage.setItem("pretty-markdown.settings.v1", "{not json");
    expect(repo.load()).toBeNull();
  });
});
