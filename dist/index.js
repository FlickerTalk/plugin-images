// Image tools for FlickerTalk (Plan §53–§55): make a picture smaller, turn it, cut it, and let it
// go without what the camera wrote in it. Everything happens on this phone: no network, no
// message of the chat, and only the file the user picks through the app.

/** The size a picture ends up with when its longest side may be `max` (0 = leave it be). */
export function fitted({ width, height }, max) {
  const longest = Math.max(width, height);
  if (!max || longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A drag, whichever way it went, as a box inside the picture. Too small a drag is not a crop. */
export function normalRect(from, to, bounds) {
  const left = Math.max(0, Math.min(from.x, to.x));
  const top = Math.max(0, Math.min(from.y, to.y));
  const right = Math.min(bounds.width, Math.max(from.x, to.x));
  const bottom = Math.min(bounds.height, Math.max(from.y, to.y));
  const width = Math.round(right - left);
  const height = Math.round(bottom - top);
  if (width < 8 || height < 8) return null;
  return { x: Math.round(left), y: Math.round(top), width, height };
}

/** What the picture is called once it has been worked on; never a path, never empty. */
export function outName(name, extension) {
  const base = String(name).split(/[\\/]/).pop()?.replace(/\.[^.]*$/, "") ?? "";
  return `${base.trim() || "image"}.${extension}`;
}

/** The longest side offered, and what each one is called in the bar. */
const SIZES = [
  { max: 640, label: "S" },
  { max: 1280, label: "M" },
  { max: 1920, label: "L" },
  { max: 0, label: "1:1" },
];

const STYLE = `
:host { display: block; font: 14px system-ui, sans-serif; color: #111; --paper: #fff; }
@media (prefers-color-scheme: dark) { :host { color: #f4f4f4; --paper: #111; } }
.bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 4px 0 10px; }
button {
  appearance: none; border: 1px solid currentColor; background: transparent; color: inherit;
  border-radius: 10px; min-width: 44px; height: 40px; font-size: 18px; cursor: pointer; opacity: .75;
}
button:disabled { opacity: .25; }
.i {
  display: block; width: 22px; height: 22px; margin: auto; background: currentColor;
  -webkit-mask: var(--i) center/contain no-repeat; mask: var(--i) center/contain no-repeat;
}
button.on { opacity: 1; background: currentColor; }
button.on .i { background: var(--paper); }
.grow { flex: 1; }
.note { font-size: 12px; opacity: .6; }
.stage { position: relative; display: grid; place-items: center; min-height: 160px; }
canvas { max-width: 100%; touch-action: none; border-radius: 8px; }
.box { position: absolute; border: 2px dashed currentColor; pointer-events: none; }
`;

class ImageTools extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.size = 1;
    this.quality = 0.8;
    this.cropping = false;
    this.name = "image.jpg";
    this.base = null;
  }

  connectedCallback() {
    this.root.innerHTML = `
      <style>${STYLE}</style>
      <div class="bar">
        <button data-act="pick" aria-label="Pick a picture"><i class="i" style="--i:url(./icon/image-outline.svg)"></i></button>
        <button data-act="rotate" aria-label="Turn a quarter" disabled><i class="i" style="--i:url(./icon/refresh-outline.svg)"></i></button>
        <button data-act="crop" aria-label="Cut a piece out" disabled><i class="i" style="--i:url(./icon/crop-outline.svg)"></i></button>
        <button data-act="undo" aria-label="Start again" disabled><i class="i" style="--i:url(./icon/arrow-undo-outline.svg)"></i></button>
        <span class="grow"></span>
        <button data-act="size" aria-label="Size"><span>M</span></button>
        <button data-act="quality" aria-label="Quality"><span>80</span></button>
        <button data-act="send" aria-label="Send it" disabled><i class="i" style="--i:url(./icon/send-outline.svg)"></i></button>
      </div>
      <div class="stage"><canvas></canvas><div class="box" hidden></div></div>
      <p class="note" hidden></p>
    `;
    this.canvas = this.root.querySelector("canvas");
    this.boxEl = this.root.querySelector(".box");
    this.noteEl = this.root.querySelector(".note");
    this.root.addEventListener("click", (event) => this.onClick(event));
    this.canvas.addEventListener("pointerdown", (event) => this.onDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.onUp(event));
    globalThis.ft?.onOpen(() => {
      if (!this.base) this.ask();
    });
  }

  onClick(event) {
    const act = event.target.closest("button")?.dataset.act;
    if (act === "pick") this.ask();
    else if (act === "rotate") this.rotate();
    else if (act === "crop") this.toggleCrop();
    else if (act === "undo") this.again();
    else if (act === "size") this.step("size");
    else if (act === "quality") this.step("quality");
    else if (act === "send") this.send();
  }

  async ask() {
    const picked = await globalThis.ft.pickFile("image/*");
    if (!picked) return;
    this.name = picked.name;
    const image = new Image();
    image.src = `data:${picked.mime || "image/jpeg"};base64,${picked.data}`;
    await image.decode().catch(() => {});
    if (!image.naturalWidth) {
      this.say("That picture cannot be read");
      return;
    }
    this.source = image;
    this.again();
  }

  /** The working picture, back to the one that was picked. */
  again() {
    if (!this.source) return;
    this.base = this.drawnInto(this.source.naturalWidth, this.source.naturalHeight, (context, canvas) =>
      context.drawImage(this.source, 0, 0, canvas.width, canvas.height),
    );
    this.cropping = false;
    this.show();
  }

  rotate() {
    if (!this.base) return;
    const from = this.base;
    this.base = this.drawnInto(from.height, from.width, (context, canvas) => {
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(Math.PI / 2);
      context.drawImage(from, -from.width / 2, -from.height / 2);
    });
    this.show();
  }

  toggleCrop() {
    this.cropping = !this.cropping;
    this.show();
  }

  step(what) {
    if (what === "size") this.size = (this.size + 1) % SIZES.length;
    else this.quality = this.quality >= 0.95 ? 0.5 : Math.round((this.quality + 0.15) * 100) / 100;
    this.show();
  }

  /** A canvas of that size, drawn by `paint`. */
  drawnInto(width, height, paint) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext("2d");
    if (context) paint(context, canvas);
    return canvas;
  }

  /** Where a pointer is, in the working picture's own pixels. */
  at(event) {
    const box = this.canvas.getBoundingClientRect();
    const scale = this.base.width / (box.width || 1);
    return { x: (event.clientX - box.left) * scale, y: (event.clientY - box.top) * scale };
  }

  onDown(event) {
    if (!this.cropping || !this.base) return;
    this.from = this.at(event);
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  onMove(event) {
    if (!this.from) return;
    const rect = normalRect(this.from, this.at(event), this.base);
    if (rect) this.outline(rect);
  }

  onUp(event) {
    if (!this.from) return;
    const rect = normalRect(this.from, this.at(event), this.base);
    this.from = null;
    this.boxEl.hidden = true;
    if (!rect) return;
    const from = this.base;
    this.base = this.drawnInto(rect.width, rect.height, (context) =>
      context.drawImage(from, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height),
    );
    this.cropping = false;
    this.show();
  }

  /** The dashed box while the finger is down, over the picture as it is shown. */
  outline(rect) {
    const box = this.canvas.getBoundingClientRect();
    const scale = (box.width || 1) / this.base.width;
    Object.assign(this.boxEl.style, {
      left: `${this.canvas.offsetLeft + rect.x * scale}px`,
      top: `${this.canvas.offsetTop + rect.y * scale}px`,
      width: `${rect.width * scale}px`,
      height: `${rect.height * scale}px`,
    });
    this.boxEl.hidden = false;
  }

  /** Everything the user sees: the picture, what the buttons say and how big it will go out. */
  show() {
    const has = Boolean(this.base);
    for (const act of ["rotate", "crop", "undo", "send"]) {
      const button = this.root.querySelector(`[data-act="${act}"]`);
      if (button) button.disabled = !has;
    }
    this.root.querySelector('[data-act="crop"]')?.classList.toggle("on", this.cropping);
    this.root.querySelector('[data-act="size"] span').textContent = SIZES[this.size].label;
    this.root.querySelector('[data-act="quality"] span').textContent = String(Math.round(this.quality * 100));
    if (!has) return;

    const view = fitted(this.base, 1024);
    this.canvas.width = view.width;
    this.canvas.height = view.height;
    this.canvas.getContext("2d")?.drawImage(this.base, 0, 0, view.width, view.height);

    const out = this.made();
    this.say(out ? `${SIZES[this.size].max ? fitted(this.base, SIZES[this.size].max).width : this.base.width}px · ${weight(out)} · no EXIF` : "");
  }

  /** The picture as it will go out: scaled, and written again so nothing of the camera is left. */
  made() {
    if (!this.base) return "";
    const out = fitted(this.base, SIZES[this.size].max);
    const canvas = this.drawnInto(out.width, out.height, (context, made) => {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, made.width, made.height);
      context.drawImage(this.base, 0, 0, made.width, made.height);
    });
    try {
      return canvas.toDataURL("image/jpeg", this.quality);
    } catch {
      return "";
    }
  }

  send() {
    const made = this.made();
    if (!made) return;
    globalThis.ft.send(outName(this.name, "jpg"), "image/jpeg", made.split(",")[1] ?? "");
  }

  say(text) {
    this.noteEl.textContent = text;
    this.noteEl.hidden = !text;
  }
}

/** How heavy a data URL is, for the user to see before sending it. */
function weight(dataUrl) {
  const bytes = Math.round(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
  return bytes > 900_000 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

customElements.define("ft-images", ImageTools);

/** An icon the app lends (`./icon/<name>.svg`): painted in the colour of the app, not a picture. */
function drawIcon(name) {
  const made = document.createElement("i");
  made.className = "i";
  made.style.setProperty("--i", `url(./icon/${name}.svg)`);
  return made;
}
