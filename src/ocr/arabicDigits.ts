/**
 * Dedicated reader for Arabic-Indic digit lines (٠١٢٣٤٥٦٧٨٩), as printed on Egyptian ID cards.
 * Stock Tesseract cannot read these reliably (measured: 0 of 7 test images), so this module:
 *   1. binarizes the ROI (shadow-tolerant adaptive threshold),
 *   2. finds the text line, splits it into per-glyph cells (connected components),
 *   3. classifies each cell with a small neural network (weights in arabicDigitModel.json).
 * The same segmentation code produces the training features (scripts/ocr-train), so train and runtime cannot drift apart.
 */
import { stretchContrast, toGray } from "./preprocess";

function median(g: Uint8ClampedArray): number {
  const h = new Uint32Array(256); for (const v of g) h[v]!++;
  let acc = 0; for (let v = 0; v < 256; v++) { acc += h[v]!; if (acc >= g.length / 2) return v; } return 128;
}

/** Segmentation tuning (chosen by measurement on synthetic cards, see scripts/ocr-seg-test.ts). */
export const TUNE = { ratio: 0.6, rDiv: 5, minAreaK: 0.012, minAreaAbs: 10, splitWide: 1.75, dilate: 0, edgeSpan: 0.85, bigBlob: 0.12, polarityMedian: 128, dotLo: 0.25, dotHi: 0.8, smallH: 0.3 };
export const GRID_W = 20, GRID_H = 24, N_EXTRA = 3, N_FEATURES = GRID_W * GRID_H + N_EXTRA;

export interface Cell { x0: number; x1: number; y0: number; y1: number; area: number; features: Float32Array; px: number[] }
export interface Segmentation { cells: Cell[]; band: { y0: number; y1: number } | null }

function boxBlur3(g: Uint8ClampedArray, w: number, h: number): Float32Array {
  const horizontal = new Uint16Array(g.length);
  const out = new Float32Array(g.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      horizontal[i] = g[i]! + (x > 0 ? g[i - 1]! : 0) + (x + 1 < w ? g[i + 1]! : 0);
    }
  }
  for (let y = 0; y < h; y++) {
    const row = y * w, ny = 1 + Number(y > 0) + Number(y + 1 < h);
    for (let x = 0; x < w; x++) {
      const i = row + x, nx = 1 + Number(x > 0) + Number(x + 1 < w);
      const sum = horizontal[i]! + (y > 0 ? horizontal[i - w]! : 0) + (y + 1 < h ? horizontal[i + w]! : 0);
      out[i] = sum / (nx * ny);
    }
  }
  return out;
}

function prepareThresholds(rgba: Uint8ClampedArray, w: number, h: number) {
  let g = toGray(rgba);
  if (median(g) < TUNE.polarityMedian) g = g.map((v) => 255 - v);
  const blur = boxBlur3(stretchContrast(g), w, h);
  const radius = Math.max(10, Math.round(h / TUNE.rDiv)), stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += blur[y * w + x]!;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1]! + row;
    }
  }
  const means = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
      means[y * w + x] = (integral[y1 * stride + x1]! - integral[y0 * stride + x1]! -
        integral[y1 * stride + x0]! + integral[y0 * stride + x0]!) / ((x1 - x0) * (y1 - y0));
    }
  }
  return { blur, means };
}

/** Darker than the local average, so a shadow across the card does not matter. */
export function binarize(rgba: Uint8ClampedArray, w: number, h: number, ratio = TUNE.ratio): Uint8Array {
  return threshold(prepareThresholds(rgba, w, h), w, h, ratio);
}

function threshold({ blur, means }: ReturnType<typeof prepareThresholds>, w: number, h: number, ratio: number) {
  const fg = new Uint8Array(w * h);
  let hasInk = false;
  for (let i = 0; i < fg.length; i++) {
    const mean = means[i]!;
    if (mean > 40 && blur[i]! < mean * ratio) { fg[i] = 1; hasInk = true; }
  }
  if (!hasInk) return fg;
  if (TUNE.dilate > 0) { // close hairline breaks so a glyph stays in one piece
    const src = fg.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (src[i]) continue;
      if (src[i - 1] || src[i + 1] || src[i - w] || src[i + w] || src[i - w - 1] || src[i - w + 1] || src[i + w - 1] || src[i + w + 1]) fg[i] = 1;
    }
  }
  // The guide box is usually wider than the card, so card edges / desk show up as dark shapes that span the whole crop height
  // (or cover a big area). Real digits never do: remove those blobs before looking for the text line.
  for (const c of components(fg, w, 0, h - 1))
    if (c.y1 - c.y0 + 1 >= TUNE.edgeSpan * h || c.area > TUNE.bigBlob * w * h) for (const p of c.px) fg[p] = 0;
  return fg;
}

/** Black text on white, with shadows and noise flattened. Used to feed Tesseract on unevenly lit or noisy cards. */
export function binarizeToRgba(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  return foregroundToRgba(binarize(rgba, w, h));
}

export function foregroundToRgba(fg: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(fg.length * 4);
  for (let i = 0, j = 0; j < fg.length; i += 4, j++) { const v = fg[j] ? 0 : 255; out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255; }
  return out;
}

/** Rows of the densest text line: largest run of rows with enough foreground (small gaps bridged). */
function findBand(fg: Uint8Array, w: number, h: number) {
  const rows = new Float32Array(h);
  for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x++) c += fg[y * w + x]!; rows[y] = c; }
  const sm = rows.map((_, y) => { let s = 0, n = 0; for (let d = -2; d <= 2; d++) { const v = rows[y + d]; if (v !== undefined) { s += v; n++; } } return s / n; });
  const mx = Math.max(...sm); if (mx < 4) return null;
  const on = Array.from(sm, (v) => v >= mx * 0.12);
  let best: { y0: number; y1: number; mass: number } | null = null, y = 0;
  while (y < h) {
    if (!on[y]) { y++; continue; }
    let y1 = y, gap = 0, mass = 0;
    for (let k = y; k < h; k++) { if (on[k]) { y1 = k; gap = 0; mass += rows[k]!; } else if (++gap > 4) break; }
    if (!best || mass > best.mass) best = { y0: y, y1, mass };
    y = y1 + 1;
  }
  return best && best.y1 - best.y0 >= 10 ? { y0: Math.max(0, best.y0 - 1), y1: Math.min(h - 1, best.y1 + 1) } : null;
}

interface Comp { x0: number; x1: number; y0: number; y1: number; area: number; px: number[] }
function components(fg: Uint8Array, w: number, y0: number, y1: number): Comp[] {
  const first = y0 * w, seen = new Uint8Array((y1 - y0 + 1) * w), out: Comp[] = [];
  for (let y = y0; y <= y1; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!fg[i] || seen[i - first]) continue;
    const stack = [i], c: Comp = { x0: x, x1: x, y0: y, y1: y, area: 0, px: [] }; seen[i - first] = 1;
    while (stack.length) {
      const p = stack.pop()!, px = p % w, py = (p - px) / w; c.px.push(p); c.area++;
      if (px < c.x0) c.x0 = px; if (px > c.x1) c.x1 = px; if (py < c.y0) c.y0 = py; if (py > c.y1) c.y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy; if (nx < 0 || nx >= w || ny < y0 || ny > y1) continue;
        const j = ny * w + nx; if (fg[j] && !seen[j - first]) { seen[j - first] = 1; stack.push(j); }
      }
    }
    out.push(c);
  }
  return out;
}

function featuresOf(px: number[], w: number, x0: number, x1: number, band: { y0: number; y1: number }): Float32Array {
  const Hb = band.y1 - band.y0 + 1, s = GRID_H / Hb, cx = (x0 + x1) / 2;
  const f = new Float32Array(N_FEATURES);
  let ymin = 1e9, ymax = -1;
  for (const p of px) {
    const x = p % w, y = (p - x) / w;
    const gx = Math.floor((x - cx) * s + GRID_W / 2), gy = Math.floor((y - band.y0) * s);
    if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) f[gy * GRID_W + gx]! += 1;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
  }
  // each grid cell covers (1/s)^2 source pixels: turn the pixel count into a coverage fraction 0..1
  for (let i = 0; i < GRID_W * GRID_H; i++) f[i] = Math.min(1, f[i]! * s * s);
  f[GRID_W * GRID_H] = Math.min(2, (x1 - x0 + 1) / Hb);
  f[GRID_W * GRID_H + 1] = Math.min(1, (ymax - ymin + 1) / Hb);
  f[GRID_W * GRID_H + 2] = ((ymin + ymax) / 2 - band.y0) / Hb;
  return f;
}

/** A merged pair of glyphs shows up as one cell ~2x the usual width: cut it where the ink is thinnest. */
function splitWideGroups(groups: Comp[][], w: number, band: { y0: number; y1: number }): Comp[][] {
  const boxes = groups.map((g) => ({ x0: Math.min(...g.map((c) => c.x0)), x1: Math.max(...g.map((c) => c.x1)), h: Math.max(...g.map((c) => c.y1)) - Math.min(...g.map((c) => c.y0)) + 1 }));
  const Hb = band.y1 - band.y0 + 1;
  const widths = boxes.filter((b) => b.h > 0.5 * Hb).map((b) => b.x1 - b.x0 + 1).sort((a, b) => a - b);
  if (widths.length < 3 || !TUNE.splitWide) return groups;
  const med = widths[Math.floor(widths.length / 2)]!;
  const out: Comp[][] = [];
  groups.forEach((g, gi) => {
    const b = boxes[gi]!, bw = b.x1 - b.x0 + 1, k = Math.round(bw / med);
    if (bw < TUNE.splitWide * med || k < 2 || k > 4) { out.push(g); return; }
    const px = g.flatMap((c) => c.px), col = new Float32Array(bw);
    for (const p of px) col[(p % w) - b.x0]!++;
    const cuts: number[] = [];
    for (let i = 1; i < k; i++) { // weakest column within +-30% of the ideal cut
      const ideal = (bw * i) / k, lo = Math.max(1, Math.floor(ideal - 0.3 * med)), hi = Math.min(bw - 2, Math.ceil(ideal + 0.3 * med));
      let best = Math.round(ideal); for (let x = lo; x <= hi; x++) if (col[x]! < col[best]!) best = x; cuts.push(b.x0 + best);
    }
    const parts: number[][] = Array.from({ length: k }, () => []);
    for (const p of px) { let i = 0; const x = p % w; while (i < cuts.length && x > cuts[i]!) i++; parts[i]!.push(p); }
    for (const pp of parts) if (pp.length) {
      const xs = pp.map((p) => p % w), ys = pp.map((p) => Math.floor(p / w));
      out.push([{ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), area: pp.length, px: pp }]);
    }
  });
  return out;
}

/** Binarize -> text line -> glyph cells (left to right), each with its feature vector. */
export function segmentLine(rgba: Uint8ClampedArray, w: number, h: number, ratio = TUNE.ratio): Segmentation {
  const { groups, band } = locateGlyphs(binarize(rgba, w, h, ratio), w, h);
  return { cells: band ? describeGlyphs(groups, w, band) : [], band };
}

function locateGlyphs(fg: Uint8Array, w: number, h: number) {
  const band = findBand(fg, w, h);
  if (!band) return { groups: [], band: null };
  const Hb = band.y1 - band.y0 + 1, minArea = Math.max(TUNE.minAreaAbs, TUNE.minAreaK * Hb * Hb);
  const comps = components(fg, w, band.y0, band.y1).filter((c) => c.area >= minArea && c.y1 - c.y0 + 1 <= Hb)
    .filter((c) => { // a small blob must sit mid-height to be the dot of a zero; specks near the top/bottom are noise
      if (c.y1 - c.y0 + 1 >= TUNE.smallH * Hb) return true;
      const cy = ((c.y0 + c.y1) / 2 - band.y0) / Hb; return cy >= TUNE.dotLo && cy <= TUNE.dotHi;
    }).sort((a, b) => a.x0 - b.x0);
  const groups: Comp[][] = [];
  for (const c of comps) {
    const g = groups.at(-1), last = g && g.reduce((m, k) => (k.x1 > m.x1 ? k : m));
    const overlap = last ? Math.min(c.x1, last.x1) - Math.max(c.x0, last.x0) + 1 : -1;
    if (g && overlap > 0.4 * Math.min(c.x1 - c.x0 + 1, last!.x1 - last!.x0 + 1)) g.push(c); else groups.push([c]);
  }
  return { groups: splitWideGroups(groups, w, band), band };
}

function describeGlyphs(groups: Comp[][], w: number, band: { y0: number; y1: number }): Cell[] {
  return groups.map((g) => {
    const x0 = Math.min(...g.map((c) => c.x0)), x1 = Math.max(...g.map((c) => c.x1));
    const px = g.length === 1 ? g[0]!.px : g.flatMap((c) => c.px);
    return { x0, x1, y0: Math.min(...g.map((c) => c.y0)), y1: Math.max(...g.map((c) => c.y1)), area: px.length, features: featuresOf(px, w, x0, x1, band), px };
  });
}

// ---- classifier (MLP: N_FEATURES -> h1 -> h2 -> 10), weights trained by scripts/ocr-train ----
export interface DigitModel { w1: number[][]; b1: number[]; w2: number[][]; b2: number[]; w3: number[][]; b3: number[] }
const transposed = new WeakMap<number[][], Float64Array[]>();
function dense(x: ArrayLike<number>, weights: number[][], biases: number[], relu: boolean) {
  let columns = transposed.get(weights);
  if (!columns) {
    columns = biases.map((_, j) => Float64Array.from(weights, (row) => row[j]!));
    transposed.set(weights, columns);
  }
  return biases.map((bias, j) => {
    const column = columns[j]!;
    let sum = bias;
    for (let i = 0; i < x.length; i++) sum += x[i]! * column[i]!;
    return relu && sum < 0 ? 0 : sum;
  });
}

interface DigitPrediction { digit: number; conf: number }

export function classify(f: Float32Array, m: DigitModel): DigitPrediction {
  const z = dense(dense(dense(f, m.w1, m.b1, true), m.w2, m.b2, true), m.w3, m.b3, false);
  const mx = Math.max(...z), e = z.map((v) => Math.exp(v - mx)), sum = e.reduce((a, b) => a + b, 0);
  let best = 0; for (let i = 1; i < 10; i++) if (e[i]! > e[best]!) best = i;
  return { digit: best, conf: e[best]! / sum };
}

/** Dynamic programming over "keep this cell" / "join it with the next one", ending with exactly `target` glyphs, maximizing confidence. */
function joinTo14(cells: Cell[], w: number, band: { y0: number; y1: number }, predict: (cell: Cell) => DigitPrediction, target = 14): Cell[] | null {
  const n = cells.length, med = [...cells.map((c) => c.x1 - c.x0 + 1)].sort((a, b) => a - b)[Math.floor(n / 2)]!;
  const merged = (i: number): Cell | null => { // cells i and i+1 as one glyph (must stay glyph-sized)
    const a = cells[i]!, b = cells[i + 1]!, x0 = Math.min(a.x0, b.x0), x1 = Math.max(a.x1, b.x1);
    if (x1 - x0 + 1 > 2.4 * med) return null;
    const px = a.px.concat(b.px);
    return { x0, x1, y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), area: a.area + b.area, features: featuresOf(px, w, x0, x1, band), px };
  };
  const single = cells.map((c) => Math.log(Math.max(1e-6, predict(c).conf)));
  const pairs = cells.slice(0, -1).map((_, i) => { const m = merged(i); return m ? { m, s: Math.log(Math.max(1e-6, predict(m).conf)) } : null; });
  const NEG = -1e9, f = Array.from({ length: n + 1 }, () => new Array<number>(target + 1).fill(NEG)), from: ("s" | "p" | null)[][] = Array.from({ length: n + 1 }, () => new Array(target + 1).fill(null));
  f[0]![0] = 0;
  for (let i = 1; i <= n; i++) for (let c = 1; c <= target; c++) {
    const a = f[i - 1]![c - 1]! + single[i - 1]!; if (a > f[i]![c]!) { f[i]![c] = a; from[i]![c] = "s"; }
    const p = i >= 2 ? pairs[i - 2] : null;
    if (p) { const b = f[i - 2]![c - 1]! + p.s; if (b > f[i]![c]!) { f[i]![c] = b; from[i]![c] = "p"; } }
  }
  if (f[n]![target]! <= NEG / 2) return null;
  const out: Cell[] = []; let i = n, c = target;
  while (i > 0) { if (from[i]![c] === "s") { out.push(cells[i - 1]!); i -= 1; } else { out.push(pairs[i - 2]!.m); i -= 2; } c--; }
  return out.reverse();
}

export interface ArabicRead { digits: string; minConf: number; cells: number }
/** Thresholds tried in turn: a glyph that falls apart at one setting is usually whole at another. */
export const RATIOS = [0.6, 0.5, 0.7, 0.42];

function readOnce(fg: Uint8Array, w: number, h: number, model: DigitModel, minConf: number): ArabicRead | null {
  const { groups, band } = locateGlyphs(fg, w, h);
  if (!band || groups.length < 4 || groups.length > 24) return null;
  let cells = describeGlyphs(groups, w, band);
  const predictions = new Map<Cell, DigitPrediction>();
  const predict = (cell: Cell) => {
    let prediction = predictions.get(cell);
    if (!prediction) {
      prediction = classify(cell.features, model);
      predictions.set(cell, prediction);
    }
    return prediction;
  };
  // Split glyphs may need joining to recover the 14-cell ID.
  if (cells.length > 14 && cells.length <= 20) cells = joinTo14(cells, w, band, predict) ?? cells;
  let digits = "", mc = 1;
  for (const c of cells) { const r = predict(c); if (r.conf < minConf) return null; digits += r.digit; mc = Math.min(mc, r.conf); }
  return { digits, minConf: mc, cells: cells.length };
}

/**
 * Reads the digit line in an ROI. Returns null unless every glyph is classified with enough confidence.
 * Prefers a reading that is a plausible 14-digit National ID; otherwise the first complete reading.
 */
export function readArabicDigits(rgba: Uint8ClampedArray, w: number, h: number, model: DigitModel, minConf = 0.92): ArabicRead | null {
  return analyzeArabicDigits(rgba, w, h, model, minConf).reading;
}

/** Reuse grayscale, blur and local means for every threshold and the first Latin fallback. */
export function analyzeArabicDigits(rgba: Uint8ClampedArray, w: number, h: number, model: DigitModel, minConf = 0.92) {
  const prepared = prepareThresholds(rgba, w, h);
  const foreground = threshold(prepared, w, h, TUNE.ratio);
  let reading: ArabicRead | null = null;
  for (const ratio of RATIOS) {
    const mask = ratio === TUNE.ratio ? foreground : threshold(prepared, w, h, ratio);
    const result = readOnce(mask, w, h, model, minConf);
    if (!result) continue;
    if (result.digits.length === 14 && /^[23]/.test(result.digits)) return { reading: result, foreground };
    reading ??= result;
  }
  return { reading, foreground };
}
