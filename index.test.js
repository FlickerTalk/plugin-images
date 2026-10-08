// The plugin's own tests (Plan §53): the arithmetic of the tool, away from any canvas.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fitted, normalRect, outName } from "./dist/index.js";
import source from "./dist/index.js?raw";
import manifest from "./module.json";

// The app's languages (plugin-sdk, module.schema.json): English is the top level.
const languages = ["es", "pt", "fr", "de", "it", "ro", "ru", "uk", "pl", "tr", "ar", "hi", "bn", "id", "vi", "th", "ja", "ko", "zh-CN", "zh-TW"];

// The schema counts characters, not UTF-16 units.
const length = (text) => [...text].length;

describe("manifest", () => {
  it("names and sums itself up in every language of the app", () => {
    expect(Object.keys(manifest.locales ?? {})).toEqual(languages);
    for (const code of languages) {
      const { name, summary, ...rest } = manifest.locales[code];
      expect(rest, code).toEqual({});
      expect(name?.trim(), code).toBeTruthy();
      expect(length(name), code).toBeLessThanOrEqual(64);
      expect(summary?.trim(), code).toBeTruthy();
      expect(length(summary), code).toBeLessThanOrEqual(200);
    }
  });

  // What it makes goes to the chat through ft.send or ft.say, which the core refuses without the
  // send permission (A2): the manifest has to ask for it, or the main action does nothing.
  it("asks to write in the chat, since it puts its result there", () => {
    expect(source).toMatch(/\bft\??\.(send|say)\(/);
    expect(manifest.permissions.send).toBe("propose");
  });
});

describe("image tools", () => {
  it("makes a picture fit the longest side asked for", () => {
    expect(fitted({ width: 4000, height: 3000 }, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitted({ width: 3000, height: 4000 }, 1280)).toEqual({ width: 960, height: 1280 });
  });

  it("never makes a picture bigger than it is", () => {
    expect(fitted({ width: 800, height: 600 }, 1280)).toEqual({ width: 800, height: 600 });
    expect(fitted({ width: 800, height: 600 }, 0)).toEqual({ width: 800, height: 600 });
  });

  it("keeps at least one pixel", () => {
    expect(fitted({ width: 4000, height: 3 }, 10)).toEqual({ width: 10, height: 1 });
  });

  // A crop is dragged in any direction, and can be dragged outside the picture.
  it("turns a drag into a box inside the picture", () => {
    expect(normalRect({ x: 30, y: 40 }, { x: 10, y: 10 }, { width: 100, height: 100 })).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 30,
    });
    expect(normalRect({ x: -20, y: 50 }, { x: 500, y: 500 }, { width: 100, height: 100 })).toEqual({
      x: 0,
      y: 50,
      width: 100,
      height: 50,
    });
  });

  it("is no crop at all when the drag went nowhere", () => {
    expect(normalRect({ x: 10, y: 10 }, { x: 10, y: 12 }, { width: 100, height: 100 })).toBe(null);
  });

  it("names what it made after what it was given", () => {
    expect(outName("holidays.HEIC", "jpg")).toBe("holidays.jpg");
    expect(outName("no dots", "jpg")).toBe("no dots.jpg");
    expect(outName("", "jpg")).toBe("image.jpg");
    expect(outName("../../etc/passwd", "jpg")).toBe("passwd.jpg");
  });

  it("is a custom element the frame can show", () => {
    expect(customElements.get("ft-images")).toBeTruthy();
  });
});

describe("the image of the Apps grid", () => {
  // icon.svg beside module.json and dist/, signed with the rest: the app draws it on the tile; the
  // Ionicon in module.json stays as the fallback (2026-10-08).
  const image = join(import.meta.dirname, "icon.svg");

  it("is a square 64 × 64 SVG of at most 4 KB at the root of the package, and not inside dist/", () => {
    expect(existsSync(image), "icon.svg").toBe(true);
    expect(statSync(image).size).toBeLessThanOrEqual(4096);
    const svg = readFileSync(image, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(existsSync(join(import.meta.dirname, "dist", "icon.svg"))).toBe(false);
  });
});
