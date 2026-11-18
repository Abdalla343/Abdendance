/** Image clean-up before OCR. Pure functions on pixel arrays so they can be unit-tested. */

export function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const g = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (rgba[i]! * 77 + rgba[i + 1]! * 150 + rgba[i + 2]! * 29) >> 8;
  return g;
}

/** Stretches contrast between the 2nd and 98th percentile so faded or glare-washed cards use the full range. */
export function stretchContrast(g: Uint8ClampedArray, lowPct = 0.02, highPct = 0.98): Uint8ClampedArray {
  const hist = new Uint32Array(256); for (const v of g) hist[v]!++;
  let acc = 0, lo = 0, hi = 255; const n = g.length;
  for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc > n * lowPct) { lo = v; break; } }
  acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= n * highPct) { hi = v; break; } }
  if (hi - lo < 16) return g; // flat image: stretching would only amplify noise
  const out = new Uint8ClampedArray(n), k = 255 / (hi - lo);
  for (let i = 0; i < n; i++) out[i] = (g[i]! - lo) * k;
  return out;
}

/** Unsharp-style 3x3 sharpening (centre 5, neighbours -1) to firm up character edges. */
export function sharpen(g: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { out[i] = g[i]!; continue; }
    out[i] = 5 * g[i]! - g[i - 1]! - g[i + 1]! - g[i - w]! - g[i + w]!;
  }
  return out;
}

export const meanOf = (g: Uint8ClampedArray) => { let s = 0; for (const v of g) s += v; return s / (g.length || 1); };

/** Full pipeline: gray -> invert light-on-dark cards -> contrast stretch -> sharpen. Returns RGBA ready for a canvas. */
export function preprocess(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  let g = toGray(rgba);
  if (meanOf(g) < 90) g = g.map((v) => 255 - v); // white text on a dark card
  g = sharpen(stretchContrast(g), w, h);
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) { out[i] = out[i + 1] = out[i + 2] = g[j]!; out[i + 3] = 255; }
  return out;
}

/** Maps the on-screen guide box to source-video pixels, accounting for object-fit: cover cropping. */
export function roiToVideo(box: { x: number; y: number; w: number; h: number }, view: { w: number; h: number }, video: { w: number; h: number }) {
  const s = Math.max(view.w / video.w, view.h / video.h), ox = (video.w * s - view.w) / 2, oy = (video.h * s - view.h) / 2;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const x = clamp((box.x + ox) / s, video.w), y = clamp((box.y + oy) / s, video.h);
  return { x, y, w: clamp(box.w / s, video.w - x), h: clamp(box.h / s, video.h - y) };
}
