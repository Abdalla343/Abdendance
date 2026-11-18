// Copies the OCR engine + language data into public/ocr so the app works fully offline (no CDN).
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), out = path.join(root, "public", "ocr");
const nm = (p) => path.join(root, "node_modules", p);
fs.mkdirSync(path.join(out, "lang"), { recursive: true });
const copy = (from, to) => { if (!fs.existsSync(from)) throw new Error(`Missing ${from}. Run npm install first.`); fs.copyFileSync(from, path.join(out, to)); };
copy(nm("tesseract.js/dist/worker.min.js"), "worker.min.js");
for (const v of ["relaxedsimd-lstm", "simd-lstm", "lstm"]) copy(nm(`tesseract.js-core/tesseract-core-${v}.wasm.js`), `tesseract-core-${v}.wasm.js`);
for (const l of ["eng"]) copy(nm(`@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`), `lang/${l}.traineddata.gz`);
console.log("OCR assets copied to public/ocr");
