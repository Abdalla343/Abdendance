// End-to-end check of the browser reader on the held-out fonts: exact / rejected / wrong.   npx tsx scripts/ocr-eval.ts /tmp/train
import fs from "node:fs"; import path from "node:path"; import jpeg from "jpeg-js";
import { readArabicDigits } from "../src/ocr/arabicDigits";
const model = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../src/ocr/arabicDigitModel.json"), "utf8"));
const dir = process.argv[2] ?? "/tmp/train", split = process.argv[3] ?? "test", MIN_CONF = Number(process.argv[4] ?? 0.55);
const man = (JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { file: string; digits: string; split: string; font: string }[]).filter((m) => m.split === split);
const stat = new Map<string, { n: number; exact: number; rejected: number; wrong: number }>(); const t0 = performance.now();
for (const m of man) {
  const img = jpeg.decode(fs.readFileSync(path.join(dir, "png", m.file)), { useTArray: true, formatAsRGBA: true });
  const r = readArabicDigits(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length), img.width, img.height, model, MIN_CONF);
  const s = stat.get(m.font) ?? { n: 0, exact: 0, rejected: 0, wrong: 0 }; s.n++;
  if (!r) s.rejected++; else if (r.digits === m.digits) s.exact++; else s.wrong++;
  stat.set(m.font, s);
}
const tot = { n: 0, exact: 0, rejected: 0, wrong: 0 };
for (const [f, s] of [...stat].sort()) { console.log(`${f.padEnd(18)} exact ${s.exact}/${s.n}  rejected ${s.rejected}  WRONG ${s.wrong}`); for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += s[k]; }
const pct = (v: number) => (100 * v / tot.n).toFixed(1) + "%";
console.log(`\n${split}: ${tot.n} lines | exact ${pct(tot.exact)} | rejected (no answer) ${pct(tot.rejected)} | WRONG answer ${pct(tot.wrong)} | ${((performance.now() - t0) / tot.n).toFixed(1)} ms/line (node)`);
