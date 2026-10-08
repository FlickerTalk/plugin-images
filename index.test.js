// The plugin's own tests (Plan §53): the arithmetic of the tool, away from any canvas.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

describe("with the Ionic the app lends", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  // Ionic moves a button's label to the native button inside it once it has drawn.
  const label = (button) => button.getAttribute("aria-label") ?? button.shadowRoot?.querySelector("button")?.getAttribute("aria-label");
  let asked = 0;
  const mount = async () => {
    asked = 0;
    globalThis.ft = { onOpen() {}, pickFile: async () => ((asked += 1), null) };
    document.body.innerHTML = "";
    const element = document.createElement("ft-images");
    document.body.append(element);
    await tick();
    return element;
  };

  afterEach(() => {
    delete globalThis.Ionicons;
    delete globalThis.ft;
  });

  // Only an app that lends Ionic can show it (app 1.6.0): an older one keeps the version it has.
  it("asks for an app that lends Ionic", () => {
    expect(manifest.minCoreVersion).toBe("1.6.0");
  });

  it("draws in the page, not in a shadow root, so Ionic's own styles reach it", async () => {
    const element = await mount();
    expect(element.shadowRoot).toBe(null);
    expect(element.querySelector("ion-toolbar")).toBeTruthy();
    expect(element.querySelector("ion-content canvas")).toBeTruthy();
  });

  it("has every action as an Ionic button in its toolbar, each with a label", async () => {
    const element = await mount();
    const acts = [...element.querySelectorAll("ion-toolbar ion-button")].map((button) => button.dataset.act);
    expect(acts).toEqual(["pick", "rotate", "crop", "undo", "size", "quality", "send"]);
    for (const button of element.querySelectorAll("ion-toolbar ion-button")) expect(label(button), button.dataset.act).toBeTruthy();
    expect(element.querySelector("button:not([class])")).toBe(null);
  });

  it("can do nothing but pick a picture until there is one", async () => {
    const element = await mount();
    const button = (act) => element.querySelector(`ion-button[data-act="${act}"]`);
    expect(button("pick").disabled).toBe(false);
    for (const act of ["rotate", "crop", "undo", "send"]) expect(button(act).disabled, act).toBe(true);
    expect(button("size").textContent.trim()).toBe("M");
    button("size").click();
    expect(button("size").textContent.trim()).toBe("L");
    button("quality").click();
    expect(button("quality").textContent.trim()).toBe("95");
  });

  it("asks the app for a picture from its button", async () => {
    const element = await mount();
    element.querySelector('ion-button[data-act="pick"]').click();
    await tick();
    expect(asked).toBe(1);
  });

  // The icons are the app's: Ionic's own when the app lent them by name, else the ones it serves.
  it("draws an Ionicon the app lent by name with ion-icon, and the one it serves otherwise", async () => {
    let element = await mount();
    expect(element.querySelector('[data-act="pick"] ion-icon')).toBe(null);
    expect(element.querySelector('[data-act="pick"] [slot="icon-only"]').getAttribute("style")).toContain("./icon/image-outline.svg");

    globalThis.Ionicons = { map: new Map([["image-outline", "data:image/svg+xml;utf8,<svg></svg>"]]) };
    element = await mount();
    expect(element.querySelector('[data-act="pick"] ion-icon[slot="icon-only"]').getAttribute("name")).toBe("image-outline");
  });
});

describe("the package", () => {
  const dist = join(import.meta.dirname, "dist");
  const files = readdirSync(dist);

  // Ionic is the app's, lent to the frame: a copy in the package would be a second one, and heavy.
  it("carries no Ionic of its own", () => {
    for (const file of files) {
      const code = readFileSync(join(dist, file), "utf8");
      expect(code, file).not.toMatch(/@ionic\/core|ionicframework|stencil|defineCustomElement|__registerHost/i);
      expect(code, file).not.toMatch(/^\s*import\s.*from\s+["'](?!\.\/)/m);
    }
  });

  // The app carries it as a seed on iOS: 128 KiB at most (plugin-sdk).
  it("is small enough to be a seed", () => {
    const bytes = files.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0);
    expect(bytes).toBeLessThanOrEqual(128 * 1024);
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
