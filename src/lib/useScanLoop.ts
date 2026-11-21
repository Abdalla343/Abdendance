import { useEffect, useRef, useState, type RefObject } from "react";
import { Consensus, type Progress } from "../ocr/consensus";
import type { Candidate } from "../ocr/parse";
import { roiToVideo } from "../ocr/preprocess";
import type { FrameReader } from "../ocr/reader";
import { NationalIdAgreement, ScanFrames } from "./scanFrames";

/** Guide rectangle in view coordinates. */
export const GUIDE = { x: 0.04, w: 0.92, h: 0.18, cy: 0.44 };
const TARGET_W = 1000;

interface Opts {
  video: RefObject<HTMLVideoElement | null>;
  view: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  reader: FrameReader | null;
  ignored: (value: string) => boolean;
  onCandidates: (ready: Candidate[], confirmed: Candidate[], signal: AbortSignal) => Promise<boolean>;
}

export function useScanLoop({ video, view, enabled, reader, ignored, onCandidates }: Opts) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const cb = useRef({ ignored, onCandidates });
  cb.current = { ignored, onCandidates };

  useEffect(() => {
    setProgress(null);
    const v = video.current, box = view.current;
    if (!enabled || !reader || !v || !box) return;
    const controller = new AbortController(), { signal } = controller;
    const consensus = new Consensus(), nationalId = new NationalIdAgreement(), frames = new ScanFrames();
    const level = new Map<string, number>();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let cancel = () => {};
    let visibilityEpoch = 0;
    const schedule = () => {
      if (signal.aborted) return;
      if (typeof v.requestVideoFrameCallback === "function") {
        const id = v.requestVideoFrameCallback((now, meta) => void tick(now, meta.mediaTime));
        cancel = () => v.cancelVideoFrameCallback(id);
      } else {
        const id = requestAnimationFrame((now) => void tick(now, v.currentTime));
        cancel = () => cancelAnimationFrame(id);
      }
    };

    async function tick(now: number, mediaTime: number) {
      if (signal.aborted) return;
      const epoch = visibilityEpoch;
      const interrupted = () => signal.aborted || document.hidden || epoch !== visibilityEpoch;
      try {
        if (document.hidden || v!.readyState < 2 || !v!.videoWidth || !frames.hasNewFrame(mediaTime, now)) return;
        const vw = box!.clientWidth, vh = box!.clientHeight;
        if (!vw || !vh) return;
        const r = roiToVideo({ x: GUIDE.x * vw, y: (GUIDE.cy - GUIDE.h / 2) * vh, w: GUIDE.w * vw, h: GUIDE.h * vh },
          { w: vw, h: vh }, { w: v!.videoWidth, h: v!.videoHeight });
        const scale = Math.min(1, TARGET_W / r.w);
        const w = Math.round(r.w * scale), h = Math.round(r.h * scale);
        if (!w || !h) return;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        ctx!.drawImage(v!, r.x, r.y, r.w, r.h, 0, 0, w, h);
        const pixels = ctx!.getImageData(0, 0, w, h).data;
        if (!frames.accept(pixels, w, now)) return;

        const read = await reader!.readPixels(pixels, w, h);
        if (interrupted()) return;
        const candidates = read.candidates.filter((c) => !cb.current.ignored(c.value));
        const high = candidates.some((c) => c.value === read.highConfidenceId?.value) ? read.highConfidenceId : undefined;
        const stable = nationalId.push(high);
        const vote = consensus.push(candidates);
        setProgress((prior) => prior?.value === vote.progress?.value && prior?.hits === vote.progress?.hits ? prior : vote.progress);

        const winner = stable && candidates.find((c) => c.value === stable);
        if (winner) {
          const safe = !read.verifyNationalId || await read.verifyNationalId();
          if (interrupted()) return;
          if (await cb.current.onCandidates(safe ? [winner] : [], [winner], signal)) controller.abort();
          return;
        }

        if (reader!.cardType === "employee") return;

        const ready = vote.ready.filter((c) => c.kind !== "NATIONAL_ID");
        const confirmed = vote.confirmed.filter((c) => c.kind !== "NATIONAL_ID" ||
          (!high && candidates.some((current) => current.value === c.value)));
        const fresh = ready.some((c) => (level.get(c.value) ?? 0) < 1) ||
          confirmed.some((c) => (level.get(c.value) ?? 0) < 2);
        if (!fresh) return;
        const manualId = confirmed.find((c) => c.kind === "NATIONAL_ID");
        if (manualId) {
          if (await cb.current.onCandidates([], [manualId], signal)) controller.abort();
          return;
        }
        ready.forEach((c) => level.set(c.value, Math.max(level.get(c.value) ?? 0, 1)));
        confirmed.forEach((c) => level.set(c.value, 2));
        if (await cb.current.onCandidates(ready, confirmed, signal)) controller.abort();
      } catch {
        nationalId.push(undefined);
      } finally {
        schedule();
      }
    }

    const onVisibility = () => {
      if (!document.hidden) return;
      visibilityEpoch++;
      consensus.reset();
      nationalId.push(undefined);
      level.clear();
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      controller.abort();
      cancel();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, reader, video, view]);

  return progress;
}
