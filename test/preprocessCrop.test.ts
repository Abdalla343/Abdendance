import { describe, expect, it } from "vitest";
import { preprocess, preprocessCrop } from "../src/ocr/preprocess";
describe("preprocessCrop", () => {
  it("preserves global contrast, polarity, edge handling and sharpen values", () => {
    const w=37,h=23;
    for(const base of [0,60,140,230]) {
      const src=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(base+(i*17)%53)%256);
      const full=preprocess(src,w,h);
      for(const [x,y,cw,ch] of [[0,0,w,h],[1,3,18,13],[0,0,1,1],[w-1,h-1,1,1],[0,4,w,5],[3,0,4,h]] as const) {
        const wanted=new Uint8ClampedArray(cw*ch*4);
        for(let j=0;j<ch;j++)wanted.set(full.subarray(((y+j)*w+x)*4,((y+j)*w+x+cw)*4),j*cw*4);
        expect(preprocessCrop(src,w,h,x,y,cw,ch)).toEqual(wanted);
      }
    }
  });
});
