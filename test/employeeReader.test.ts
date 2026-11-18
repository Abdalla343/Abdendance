import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameReader } from "../src/ocr/reader";
import type { OcrEngine } from "../src/ocr/engine";
import type { DigitModel } from "../src/ocr/arabicDigits";

vi.mock("../src/ocr/arabicDigits", () => ({
  analyzeArabicDigits: () => { throw new Error("Employee mode must not call the National ID classifier"); },
  binarize: (_pixels: Uint8ClampedArray, w: number, h: number) => new Uint8Array(w * h),
  foregroundToRgba: (pixels: Uint8Array) => new Uint8ClampedArray(pixels.length * 4),
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const frame = async (first: string, second = first, confidence = 95) => {
  vi.stubGlobal("ImageData", class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ putImageData: vi.fn() } as unknown as CanvasRenderingContext2D);
  const read = vi.fn().mockResolvedValueOnce({ text: first, confidence }).mockResolvedValueOnce({ text: second, confidence });
  const reader = new FrameReader({ read } as unknown as OcrEngine, {} as DigitModel, "employee");
  const result = await reader.readPixels(new Uint8ClampedArray(20 * 20 * 4).fill(255), 20, 20);
  return { result, read };
};

describe("separate employee-card reader", () => {
  it.each(["ZTC535", "000501", "12345678901234", "EMPLOYEE"])("reads the exact employee code %s after both paths agree", async (value) => {
    const { result, read } = await frame(value);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.candidates[0]?.value).toBe(value);
    expect(result.highConfidenceId?.value).toBe(value);
  });
  it("rejects conflicting paths instead of choosing a plausible worker", async () => {
    expect((await frame("ZTC535", "ZTC585")).result.candidates).toEqual([]);
  });
  it("rejects low confidence, surrounding text and uncertain substitutions", async () => {
    expect((await frame("ZTC535", "ZTC535", 89)).result.candidates).toEqual([]);
    expect((await frame("ID ZTC535")).result.candidates).toEqual([]);
    expect((await frame("ZTC535\nNAME")).result.candidates).toEqual([]);
  });
});

describe("optional employee barcode detection", () => {
  it("reuses a supported native detector and returns exact codes without loading OCR", async () => {
    vi.stubGlobal("ImageData", class {});
    const detect = vi.fn().mockResolvedValue([{ rawValue: "IR-1234" }]);
    const formats = vi.fn().mockResolvedValue(["code_128", "qr_code"]);
    const ctor = vi.fn();
    vi.stubGlobal("BarcodeDetector", class {
      static getSupportedFormats = formats;
      constructor() { ctor(); }
      detect = detect;
    });
    const read = vi.fn();
    const reader = new FrameReader({ read } as unknown as OcrEngine, {} as DigitModel, "employee");
    for (let i = 0; i < 3; i++) {
      const result = await reader.readPixels(new Uint8ClampedArray(16), 2, 2);
      expect(result.highConfidenceId).toEqual({ value: "IR1234", source: "barcode" });
    }
    expect(formats).toHaveBeenCalledOnce(); expect(ctor).toHaveBeenCalledOnce(); expect(read).not.toHaveBeenCalled();
    detect.mockResolvedValue([{ rawValue: "IR1234" }, { rawValue: "IR1235" }]);
    expect((await reader.readPixels(new Uint8ClampedArray(16), 2, 2)).candidates).toEqual([]);
  });

  it("falls back to OCR if the platform decoder fails", async () => {
    vi.stubGlobal("BarcodeDetector", class {
      static getSupportedFormats = async () => ["qr_code"];
      detect = async () => { throw new Error("unavailable"); };
    });
    expect((await frame("A123")).result.highConfidenceId?.value).toBe("A123");
  });
});
