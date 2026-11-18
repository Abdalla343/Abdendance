import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState = "starting" | "ready" | "denied" | "insecure" | "none" | "error";

/** Rear camera stream for the scanner. Stops when the tab is hidden (battery) and restarts when it is visible again. */
export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setTorchOn(false); }, []);

  useEffect(() => {
    if (!enabled) { stop(); return; }
    let generation = 0;
    async function start() {
      if (document.hidden) return;
      const request = ++generation;
      if (!navigator.mediaDevices?.getUserMedia) { setState(window.isSecureContext ? "error" : "insecure"); return; }
      setState("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        if (request !== generation || document.hidden) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0]!;
        // Start the preview while the camera applies continuous autofocus.
        void track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        setTorchSupported(Boolean((track.getCapabilities?.() as { torch?: boolean } | undefined)?.torch));
        const v = videoRef.current; if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        if (request === generation) setState("ready");
      } catch (e) {
        if (request !== generation) return;
        const name = (e as DOMException).name;
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "none" : "error");
      }
    }
    void start();
    const onVis = () => {
      if (document.hidden) { generation++; stop(); setState("starting"); }
      else if (!streamRef.current) void start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { generation++; document.removeEventListener("visibilitychange", onVis); stop(); };
  }, [enabled, attempt, stop]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]; if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] }); setTorchOn(!torchOn); } catch { /* ignore */ }
  }, [torchOn]);

  return { videoRef, state, torchSupported, torchOn, toggleTorch, retry: () => setAttempt((a) => a + 1) };
}
