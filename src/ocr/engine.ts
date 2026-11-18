import { createWorker, type Worker } from "tesseract.js";

/**
 * Offline Tesseract (Latin letters + Western digits), bundled in /ocr (no internet).
 * Arabic-Indic digits are NOT read here: the stock Arabic model failed our tests, so arabicDigits.ts handles them.
 */
const WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export interface OcrRead { text: string; confidence: number }

export class OcrEngine {
  private loading: Promise<Worker> | null = null;
  constructor(private base = `${import.meta.env.BASE_URL}ocr`, private psm = "6") {}

  /** Loads the worker once. Call early so the first scan is instant. */
  load(): Promise<Worker> {
    return (this.loading ??= (async () => {
      const w = await createWorker("eng", 1, {
        workerPath: `${this.base}/worker.min.js`, corePath: this.base, langPath: `${this.base}/lang`,
        workerBlobURL: false, gzip: true, cacheMethod: "none", logger: () => {},
      });
      await w.setParameters({ tessedit_char_whitelist: WHITELIST, tessedit_pageseg_mode: this.psm as never, preserve_interword_spaces: "1" });
      return w;
    })());
  }
  async read(image: HTMLCanvasElement): Promise<OcrRead> {
    const { data } = await (await this.load()).recognize(image);
    return { text: data.text, confidence: data.confidence };
  }
  async dispose() { const w = await this.loading?.catch(() => null); await w?.terminate(); this.loading = null; }
}
