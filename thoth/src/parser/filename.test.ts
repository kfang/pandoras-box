import { describe, expect, it } from "bun:test";
import { parseFilename, groupBySeries } from "./filename";

describe("parseFilename", () => {
  it("pattern 1: basic volume — {Series} v{NN}.ext", () => {
    const result = parseFilename("/mnt/h/manga/Full Metal Panic!/Full Metal Panic! v01.cbz");
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Full Metal Panic!");
    expect(result!.volume).toBe(1);
    expect(result!.format).toBe("cbz");
  });

  it("pattern 2: volume with extras — {Series} v{NN} (extras...).ext", () => {
    const result = parseFilename(
      "/mnt/h/manga/Dusk Maiden of Amnesia v03 (Digital-Compilation) (Oak) (f).cbz"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Dusk Maiden of Amnesia");
    expect(result!.volume).toBe(3);
    expect(result!.format).toBe("cbz");
  });

  it("pattern 2: volume with year in extras", () => {
    const result = parseFilename(
      "/mnt/h/manga/Cardcaptor Sakura - Clear Card v15 (2024) (Digital) (Ushi).cbz"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Cardcaptor Sakura - Clear Card");
    expect(result!.volume).toBe(15);
    expect(result!.year).toBe(2024);
  });

  it("pattern 3: sub-series name is captured as full seriesName at parse time", () => {
    const result = parseFilename(
      "/mnt/h/manga/Umineko When They Cry - Episode 1 - Legend of the Golden Witch v01 (2-in-1 Edition) (2012) (Digital SD) (Ushi) (ED).cbz"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe(
      "Umineko When They Cry - Episode 1 - Legend of the Golden Witch"
    );
    expect(result!.volume).toBe(1);
  });

  it("pattern 3: Girl Meets Dragon full name captured", () => {
    const result = parseFilename(
      "/mnt/h/manga/Girl Meets Dragon - The Sacrificial Maiden's Happily Ever After v02 (Digital-Compilation) (Oak).cbz"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe(
      "Girl Meets Dragon - The Sacrificial Maiden's Happily Ever After"
    );
    expect(result!.volume).toBe(2);
  });

  it("pattern 4: LN numbered — {Series} - LN {NN} Premium.ext", () => {
    const result = parseFilename(
      "/mnt/h/manga/Infinite Dendrogram - LN 01 Premium.epub"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Infinite Dendrogram");
    expect(result!.volume).toBe(1);
    expect(result!.format).toBe("epub");
  });

  it("pattern 5: Volume word — {Series} - Volume {NN}.ext", () => {
    const result = parseFilename(
      "/mnt/h/manga/Infinite Dendrogram - Volume 20.epub"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Infinite Dendrogram");
    expect(result!.volume).toBe(20);
  });

  it("pattern 5: SP Volume — {Series} SP - Volume {NN}.ext", () => {
    const result = parseFilename(
      "/mnt/h/manga/Infinite Dendrogram SP - Volume 01.epub"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Infinite Dendrogram SP");
    expect(result!.volume).toBe(1);
  });

  it("pattern 5: Volume Premium", () => {
    const result = parseFilename(
      "/mnt/h/manga/Infinite Dendrogram - Volume 19 Premium.epub"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Infinite Dendrogram");
    expect(result!.volume).toBe(19);
  });

  it("pattern 6: bracket publisher — {Series} v{NN} [{publisher}] [{group}].ext", () => {
    const result = parseFilename(
      "/mnt/h/manga/Infinite Dendrogram v04 [J-Novel Club] [LuCaZ].epub"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Infinite Dendrogram");
    expect(result!.volume).toBe(4);
    expect(result!.publisher).toBe("J-Novel Club");
    expect(result!.group).toBe("LuCaZ");
  });

  it("pattern 7: chapter-based — {Series} - c{chapters} (v{NN}) [{group}].ext", () => {
    const result = parseFilename(
      "/mnt/h/manga/Furyou Taimashi Reina - c001-010x1 (v01) [Moe Panda Scans].cbz"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Furyou Taimashi Reina");
    expect(result!.volume).toBe(1);
    expect(result!.chapters).toBe("001-010x1");
    expect(result!.group).toBe("Moe Panda Scans");
  });

  it("handles unicode characters (sigma)", () => {
    const result = parseFilename(
      "/mnt/h/manga/Full Metal Panic! Σ/Full Metal Panic! Σ v01.cbz"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Full Metal Panic! Σ");
    expect(result!.volume).toBe(1);
  });

  it("simple epub volume", () => {
    const result = parseFilename(
      "/mnt/h/manga/Seiken Tsukai no World Break v01.epub"
    );
    expect(result).not.toBeNull();
    expect(result!.seriesName).toBe("Seiken Tsukai no World Break");
    expect(result!.volume).toBe(1);
    expect(result!.format).toBe("epub");
  });

  it("returns null for unsupported extensions", () => {
    expect(parseFilename("/some/file.pdf")).toBeNull();
    expect(parseFilename("/some/file.txt")).toBeNull();
  });

  it("returns null for unparseable filenames", () => {
    expect(parseFilename("/some/random file.cbz")).toBeNull();
  });
});

describe("groupBySeries", () => {
  it("groups files by series name", () => {
    const files = [
      parseFilename("/mnt/h/manga/Full Metal Panic! v01.cbz")!,
      parseFilename("/mnt/h/manga/Full Metal Panic! v02.cbz")!,
      parseFilename("/mnt/h/manga/Nana to Kaoru v01.cbz")!,
    ];
    const groups = groupBySeries(files);
    expect(groups.size).toBe(2);
    expect(groups.get("Full Metal Panic!")!.length).toBe(2);
    expect(groups.get("Nana to Kaoru")!.length).toBe(1);
  });

  it("merges Umineko episodes under common prefix", () => {
    const files = [
      parseFilename(
        "/mnt/h/manga/Umineko When They Cry - Episode 1 - Legend of the Golden Witch v01 (2-in-1 Edition) (2012) (Digital SD) (Ushi) (ED).cbz"
      )!,
      parseFilename(
        "/mnt/h/manga/Umineko When They Cry - Episode 2 - Turn of the Golden Witch v01 (3-in-1 Edition) (2013) (Digital SD) (Ushi) (ED).cbz"
      )!,
    ];
    const groups = groupBySeries(files);
    expect(groups.size).toBe(1);
    expect(groups.has("Umineko When They Cry")).toBe(true);
    expect(groups.get("Umineko When They Cry")!.length).toBe(2);

    const first = groups.get("Umineko When They Cry")![0];
    expect(first.seriesName).toBe("Umineko When They Cry");
    expect(first.subSeries).toBe("Episode 1 - Legend of the Golden Witch");
  });

  it("does NOT merge single-entry dash names (Cardcaptor)", () => {
    const files = [
      parseFilename(
        "/mnt/h/manga/Cardcaptor Sakura - Clear Card v15 (2024) (Digital) (Ushi).cbz"
      )!,
      parseFilename(
        "/mnt/h/manga/Cardcaptor Sakura - Clear Card v16 (2025) (Digital) (Ushi).cbz"
      )!,
    ];
    const groups = groupBySeries(files);
    expect(groups.size).toBe(1);
    expect(groups.has("Cardcaptor Sakura - Clear Card")).toBe(true);
    expect(groups.get("Cardcaptor Sakura - Clear Card")![0].subSeries).toBeUndefined();
  });

  it("does NOT merge Girl Meets Dragon (single sub-name)", () => {
    const files = [
      parseFilename(
        "/mnt/h/manga/Girl Meets Dragon - The Sacrificial Maiden's Happily Ever After v01 (Digital-Compilation) (Oak) (f).cbz"
      )!,
      parseFilename(
        "/mnt/h/manga/Girl Meets Dragon - The Sacrificial Maiden's Happily Ever After v02 (Digital-Compilation) (Oak).cbz"
      )!,
    ];
    const groups = groupBySeries(files);
    expect(groups.size).toBe(1);
    // All files have same name, so no prefix merging needed
    expect(
      groups.has("Girl Meets Dragon - The Sacrificial Maiden's Happily Ever After")
    ).toBe(true);
  });
});
