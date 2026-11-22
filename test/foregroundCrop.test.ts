import { describe, expect, it } from "vitest";
import { foregroundToRgba } from "../src/ocr/arabicDigits";
import { foregroundCrop } from "../src/ocr/preprocess";
describe("foreground crop", () => {
  it("matches full conversion followed by cropping for edge and interior rectangles", () => {
    const w = 17, h = 11;
    const fg = Uint8Array.from({ length: w * h }, (_, i) => i % 3 === 0 ? 1 : 0);
    const full = foregroundToRgba(fg);
    for (const [left, top, width, height] of [[0,0,17,11],[2,3,5,4],[16,10,1,1],[0,4,17,7]] as const) {
      const expected = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) expected.set(full.subarray(((top+y)*w+left)*4, ((top+y)*w+left+width)*4), y*width*4);
      expect(foregroundCrop(fg,w,left,top,width,height)).toEqual(expected);
    }
  });
});
