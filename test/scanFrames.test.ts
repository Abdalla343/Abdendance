import { describe, expect, it } from "vitest";
import { NationalIdAgreement, ScanFrames } from "../src/lib/scanFrames";

const pixels = () => new Uint8ClampedArray(32 * 32 * 4).fill(255);

describe("camera frames", () => {
  it("rejects a repeated media frame and byte-identical crops from new frames", () => {
    const frames = new ScanFrames();
    expect(frames.hasNewFrame(0, 0)).toBe(true);
    expect(frames.accept(pixels(), 32, 0)).toBe(true);
    expect(frames.hasNewFrame(0, 220)).toBe(false);
    expect(frames.hasNewFrame(1, 220)).toBe(true);
    expect(frames.accept(pixels(), 32, 220)).toBe(false);
    expect(frames.accept(pixels(), 32, 1000)).toBe(false);
  });

  it("throttles near copies but later reads a fresh lightly changed crop", () => {
    const frames = new ScanFrames(), original = pixels(), changed = original.slice();
    changed[4] = 230;
    expect(frames.accept(original, 32, 0)).toBe(true);
    expect(frames.accept(changed, 32, 100)).toBe(false);
    expect(frames.accept(changed, 32, 200)).toBe(true);
  });
});

describe("high-confidence National ID", () => {
  const arabic = { value: "29501010100001", source: "arabic" as const };
  it("requires three consecutive high-confidence readings after missing, conflicting or mixed-source readings", () => {
    const agreement = new NationalIdAgreement();
    for (const reading of [arabic, arabic, undefined, arabic, { ...arabic, value: "29501010100002" },
      arabic, { ...arabic, source: "latin" as const }, arabic, arabic])
      expect(agreement.push(reading)).toBeUndefined();
    expect(agreement.push(arabic)).toBe(arabic.value);
  });
});
