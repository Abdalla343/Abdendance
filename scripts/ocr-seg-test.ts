// Measures how often a line is split into exactly the right number of glyph cells.  npx tsx scripts/ocr-seg-test.ts /tmp/train 500 '{"ratio":0.85}'
import fs from "node:fs"; import path from "node:path"; import jpeg from "jpeg-js";
import { TUNE, segmentLine } from "../src/ocr/arabicDigits";
const dir = process.argv[2] ?? "/tmp/train", n = Number(process.argv[3] ?? 500); Object.assign(TUNE, JSON.parse(process.argv[4] ?? "{}"));
const man = (JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { file: string; digits: string; split: string }[]).filter((m) => m.split === "train").filter((_, i) => i % Math.floor(4500 / n) === 0).slice(0, n);
let ok = 0, under = 0, over = 0, none = 0;
for (const m of man) {
  const img = jpeg.decode(fs.readFileSync(path.join(dir, "png", m.file)), { useTArray: true, formatAsRGBA: true });
  const s = segmentLine(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length), img.width, img.height);
  if (!s.band) none++; else if (s.cells.length === m.digits.length) ok++; else if (s.cells.length < m.digits.length) under++; else over++;
}
console.log(JSON.stringify(TUNE), `\n  exact ${(100 * ok / man.length).toFixed(1)}%  under ${under}  over ${over}  no-line ${none}  (n=${man.length})`);
