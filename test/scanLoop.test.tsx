import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useScanLoop } from "../src/lib/useScanLoop";
import type { FrameRead, FrameReader } from "../src/ocr/reader";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const reading = (): FrameRead => ({
  candidates: [{ value: "29501010100001", kind: "NATIONAL_ID", semanticOk: true, strength: 100 }],
  highConfidenceId: { value: "29501010100001", source: "latin" }, arabic: null, latin: "29501010100001",
});

function setup() {
  let frameCallback: VideoFrameRequestCallback | null = null, serial = 0;
  const video = document.createElement("video"), view = document.createElement("div");
  for (const [key, value] of Object.entries({ videoWidth: 400, videoHeight: 800, readyState: 2 }))
    Object.defineProperty(video, key, { value });
  Object.defineProperty(view, "clientWidth", { value: 400 });
  Object.defineProperty(view, "clientHeight", { value: 800 });
  video.requestVideoFrameCallback = vi.fn((cb) => { frameCallback = cb; return 1; });
  video.cancelVideoFrameCallback = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(368 * 208 * 4).fill(30 + 25 * ++serial) }),
  } as unknown as CanvasRenderingContext2D);
  const readPixels = vi.fn().mockImplementation(async () => reading());
  const onCandidates = vi.fn().mockResolvedValue(true);
  const refs = { video: { current: video }, view: { current: view } };
  const reader = { readPixels, cardType: "national" } as unknown as FrameReader;
  function Harness({ enabled }: { enabled: boolean }) {
    useScanLoop({ ...refs, reader, enabled, ignored: () => false, onCandidates });
    return null;
  }
  const tick = async (i: number) => {
    const callback = frameCallback!;
    frameCallback = null;
    await act(async () => callback(i * 200, { mediaTime: i / 5 } as VideoFrameCallbackMetadata));
  };
  return { Harness, tick, onCandidates, readPixels, video };
}

describe("scanner through the camera loop", () => {
  it("stops scheduling frames immediately after the third high-confidence result is handled", async () => {
    const s = setup(); render(<s.Harness enabled />);
    await s.tick(1); await s.tick(2);
    expect(s.onCandidates).not.toHaveBeenCalled();
    await s.tick(3);
    expect(s.onCandidates).toHaveBeenCalledOnce();
    expect(s.onCandidates.mock.calls[0]![0][0].value).toBe("29501010100001");
    expect(s.video.requestVideoFrameCallback).toHaveBeenCalledTimes(3);
    expect(s.readPixels).toHaveBeenCalledTimes(3);
  });

  it("discards a late third read after the operator leaves scanning", async () => {
    const s = setup(), mounted = render(<s.Harness enabled />);
    await s.tick(1); await s.tick(2);
    let resolve!: (value: FrameRead) => void;
    s.readPixels.mockImplementationOnce(() => new Promise<FrameRead>((done) => { resolve = done; }));
    // Do not await the OCR result while simulating the camera's next callback.
    const next = s.tick(3);
    await act(async () => { mounted.rerender(<s.Harness enabled={false} />); });
    resolve(reading()); await next;
    expect(s.onCandidates).not.toHaveBeenCalled();
  });
});
