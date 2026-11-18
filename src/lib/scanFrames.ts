import type { FrameRead } from "../ocr/reader";

const MIN_INTERVAL_MS = 80;
const NEAR_REPEAT_MS = 180;

/** Suppress exact copies and throttle nearly static crops without letting a skipped crop vote. */
export class ScanFrames {
  private previous: Uint32Array | null = null;
  private last = -Infinity;
  private mediaTime = -Infinity;
  private width = 0;

  hasNewFrame(time: number, now: number) {
    if (time === this.mediaTime || now - this.last < MIN_INTERVAL_MS) return false;
    this.mediaTime = time;
    return true;
  }

  accept(pixels: Uint8ClampedArray, width: number, now: number) {
    const current = new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.byteLength / 4);
    const previous = this.previous;
    if (previous && width === this.width && previous.length === current.length) {
      let sampled = 0, changed = 0;
      for (let y = 0; y < current.length / width; y += 8) {
        for (let x = 0; x < width; x += 8) {
          const i = y * width + x;
          const old = previous[i]!;
          const next = current[i]!;
          // Canvas image data packs RGB into the first three bytes on supported browser platforms.
          if (Math.abs((old & 255) - (next & 255)) > 4 ||
              Math.abs(((old >>> 8) & 255) - ((next >>> 8) & 255)) > 4 ||
              Math.abs(((old >>> 16) & 255) - ((next >>> 16) & 255)) > 4) changed++;
          sampled++;
        }
      }
      if (changed <= sampled * 0.015) {
        if (now - this.last < NEAR_REPEAT_MS) return false;
        if (current.every((pixel, i) => pixel === previous[i])) return false;
      }
    }
    this.previous = current;
    this.width = width;
    this.last = now;
    return true;
  }
}

export class NationalIdAgreement {
  private previous: FrameRead["highConfidenceId"];
  private hits = 0;

  push(reading: FrameRead["highConfidenceId"]) {
    const value = reading?.value;
    this.hits = value ? (this.previous?.value === value && this.previous.source === reading?.source ? this.hits + 1 : 1) : 0;
    this.previous = reading;
    return this.hits >= 3 ? value : undefined;
  }
}
