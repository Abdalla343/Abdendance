import { analyzeArabicDigits, binarize, foregroundToRgba, type DigitModel } from "./arabicDigits";
import type { OcrEngine } from "./engine";
import { extractCandidates, type Candidate } from "./parse";
import { EmployeeBarcode } from "./employeeBarcode";
import { preprocess } from "./preprocess";

export interface FrameRead {
  candidates: Candidate[];
  arabic: string | null;
  latin: string;
  highConfidenceId?: { value: string; source: "arabic" | "latin" | "barcode" };
  verifyNationalId?: () => Promise<boolean>;
}

const exactId = (candidates: Candidate[], text: string) => {
  const ids = candidates.filter((c) => c.kind === "NATIONAL_ID");
  const id = ids[0];
  return ids.length === 1 && id?.semanticOk && /^\d{14}$/.test(text) && id.value === text ? id.value : undefined;
};

export type CardType = "national" | "employee";

export class FrameReader {
  private n = 0;
  private barcode = new EmployeeBarcode();
  private work: HTMLCanvasElement | null = null;
  constructor(private engine: OcrEngine, private model: DigitModel, readonly cardType: CardType = "national") {}

  private async employeeCard(src: Uint8ClampedArray, w: number, h: number): Promise<FrameRead> {
    const barcodes = await this.barcode.read(src, w, h);
    if (barcodes.length > 1) return { candidates: [], arabic: null, latin: "" };
    if (barcodes.length === 1) {
      const value = barcodes[0]!;
      return {
        candidates: [{ value, kind: /^\d+$/.test(value) ? "NUMERIC" : "CODE", strength: 100 }],
        arabic: null, latin: "", highConfidenceId: { value, source: "barcode" },
      };
    }
    const foreground = binarize(src, w, h);
    // Locate the printed token without resizing glyphs. Extra padding gives OCR a clean border.
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!foreground[y * w + x]) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const left = x1 >= 0 ? Math.max(0, x0 - 16) : 0;
    const top = y1 >= 0 ? Math.max(0, y0 - 16) : 0;
    const width = x1 >= 0 ? Math.min(w, x1 + 17) - left : w;
    const height = y1 >= 0 ? Math.min(h, y1 + 17) - top : h;
    const crop = (pixels: Uint8ClampedArray) => {
      const out = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++)
        out.set(pixels.subarray(((top + y) * w + left) * 4, ((top + y) * w + left + width) * 4), y * width * 4);
      return out;
    };
    const paths = [() => crop(preprocess(src, w, h)), () => crop(foregroundToRgba(foreground))];
    if (this.n++ % 2) paths.reverse();
    const readings: Array<{ value: string; confidence: number }> = [];
    let latin = "";
    // Two independent preprocessing paths must agree on a single printed token.
    for (const path of paths) {
      const work = this.work ??= document.createElement("canvas");
      if (work.width !== width) work.width = width;
      if (work.height !== height) work.height = height;
      work.getContext("2d")!.putImageData(new ImageData(path() as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
      const result = await this.engine.read(work);
      latin = result.text.trim();
      const value = latin.toUpperCase();
      // No letter-to-digit repairs in employee mode. The guide must contain just the ID.
      if (!/^[A-Z0-9]{3,40}$/.test(value) || result.confidence < 90) return { candidates: [], arabic: null, latin };
      readings.push({ value, confidence: result.confidence });
    }
    const value = readings[0]!.value;
    if (readings.some((reading) => reading.value !== value)) return { candidates: [], arabic: null, latin };
    const candidate: Candidate = { value, kind: /^\d+$/.test(value) ? "NUMERIC" : "CODE", strength: 80 };
    return { candidates: [candidate], arabic: null, latin, highConfidenceId: { value, source: "latin" } };
  }

  async readPixels(src: Uint8ClampedArray, w: number, h: number): Promise<FrameRead> {
    if (this.cardType === "employee") return this.employeeCard(src, w, h);
    const { reading, foreground } = analyzeArabicDigits(src, w, h, this.model);
    const arabic = reading?.digits ?? null;
    const fromArabic = arabic ? extractCandidates(arabic) : [];
    const paths = [() => foregroundToRgba(foreground), () => preprocess(src, w, h)];
    const attempt = async (pixels: Uint8ClampedArray) => {
      const work = this.work ??= document.createElement("canvas");
      if (work.width !== w) work.width = w;
      if (work.height !== h) work.height = h;
      work.getContext("2d")!.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      const { text, confidence } = await this.engine.read(work);
      return { text, confidence, candidates: extractCandidates(text) };
    };
    if (fromArabic.some((c) => c.kind === "NATIONAL_ID" && c.semanticOk)) {
      const value = exactId(fromArabic, arabic ?? "");
      if (!value) return { candidates: fromArabic, arabic, latin: "" };
      // The Arabic classifier can confidently misread Western glyphs. Look for a conflicting
      // Western reading on the decisive frame before allowing an automatic worker lookup.
      const verifyNationalId = async () => {
        for (const path of paths) {
          const { candidates } = await attempt(path());
          const ids = candidates.filter((c) => c.kind === "NATIONAL_ID" && c.semanticOk);
          if (ids.some((c) => c.value !== value)) return false;
        }
        return true;
      };
      return { candidates: fromArabic, arabic, latin: "", highConfidenceId: { value, source: "arabic" }, verifyNationalId };
    }

    // Keep both fallback paths and alternate their order for company codes and Western IDs.
    if (this.n++ % 2) paths.reverse();
    let result = await attempt(paths[0]!());
    if (!result.candidates.length) result = await attempt(paths[1]!());
    const candidates = [...new Map([...fromArabic, ...result.candidates].map((c) => [c.value, c])).values()]
      .sort((a, b) => b.strength - a.strength);
    const latin = result.text.trim();
    const unambiguousLines = latin.split(/\r?\n/).map((line) => line.replace(/\s/g, "")).filter((line) => /^\d{14}$/.test(line));
    const value = result.confidence >= 90 && unambiguousLines.length === 1
      ? exactId(candidates, unambiguousLines[0]!)
      : undefined;
    return { candidates, arabic, latin, highConfidenceId: value ? { value, source: "latin" } : undefined };
  }

  read(roi: HTMLCanvasElement): Promise<FrameRead> {
    const ctx = roi.getContext("2d", { willReadFrequently: true })!;
    return this.readPixels(ctx.getImageData(0, 0, roi.width, roi.height).data, roi.width, roi.height);
  }
}
