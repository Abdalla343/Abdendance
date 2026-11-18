// Runs the SAME TypeScript segmentation used in the browser over the synthetic images, and writes per-cell
// features + labels for training.   npx tsx scripts/ocr-extract.ts /tmp/train
import fs from "node:fs"; import path from "node:path";
import jpeg from "jpeg-js";
import { segmentLine } from "../src/ocr/arabicDigits";

const dir = process.argv[2] ?? "/tmp/train";
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { file: string; digits: string; split: string; font: string }[];
const out: { split: string; font: string; digits: string; nCells: number; cells: { f: number[]; label: number | null }[] }[] = [];
let ok = 0;
for (const m of manifest) {
  const img = jpeg.decode(fs.readFileSync(path.join(dir, "png", m.file)), { useTArray: true, formatAsRGBA: true });
  const seg = segmentLine(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length), img.width, img.height);
  const good = seg.cells.length === m.digits.length;
  if (good) ok++;
  out.push({ split: m.split, font: m.font, digits: m.digits, nCells: seg.cells.length,
    cells: seg.cells.map((c, i) => ({ f: Array.from(c.features, (v) => Math.round(v * 1000) / 1000), label: good ? Number(m.digits[i]) : null })) });
}
fs.writeFileSync(path.join(dir, "features.json"), JSON.stringify(out));
console.log(`segmented ${ok}/${manifest.length} lines into the expected number of cells`);
