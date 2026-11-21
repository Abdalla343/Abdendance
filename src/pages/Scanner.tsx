import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ManualEntry } from "../components/ManualEntry";
import { ResultPanel, type Shown } from "../components/ResultPanel";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { beep } from "../lib/feedback";
import { lookupWorker, newOperationId, submitScan, type Direction, type IdType, type ScanMethod, type ScanView } from "../lib/scanApi";
import { GUIDE, useScanLoop } from "../lib/useScanLoop";
import { useCamera } from "../lib/useCamera";
import model from "../ocr/arabicDigitModel.json";
import type { DigitModel } from "../ocr/arabicDigits";
import { OcrEngine } from "../ocr/engine";
import type { Candidate } from "../ocr/parse";
import { FrameReader, type CardType } from "../ocr/reader";

type Phase = { k: "scanning" } | { k: "busy"; shown: Shown } | { k: "result"; shown: Shown } | { k: "manual"; value: string; notFound: boolean; review?: boolean };
const COOLDOWN_MS = 8000;
const read = <T,>(key: string, fallback: T): T => { try { return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback; } catch { return fallback; } };

export default function Scanner() {
  const { t } = useI18n(); const { user } = useAuth();
  const [mode, setMode] = useState<Direction>(() => read("att.mode", "IN"));      // stays until the officer changes it
  const [sound, setSound] = useState<boolean>(() => read("att.sound", true));
  const [gate, setGate] = useState<string>(() => read("att.gate", user?.username ?? ""));
  const [phase, setPhase] = useState<Phase>({ k: "scanning" });
  const [readerState, setReaderState] = useState<"loading" | "ready" | "failed">("loading");
  const readers = useRef<Record<CardType, FrameReader> | null>(null);
  const [cardType, setCardType] = useState<CardType>("national");
  const view = useRef<HTMLDivElement>(null);
  const ignore = useRef(new Map<string, number>());
  const pending = useRef<{ opId: string; value: string; mode: Direction; idType: IdType; scanMethod: ScanMethod } | null>(null);
  const timer = useRef<number>(0);
  const phaseRef = useRef<Phase>({ k: "scanning" });
  const looked = useRef(new Set<string>());
  console.log("user", user);

  const scanning = phase.k === "scanning";
  const cam = useCamera(phase.k !== "manual");
  useEffect(() => { localStorage.setItem("att.mode", JSON.stringify(mode)); }, [mode]);
  useEffect(() => { localStorage.setItem("att.sound", JSON.stringify(sound)); }, [sound]);
  useEffect(() => { localStorage.setItem("att.gate", JSON.stringify(gate)); }, [gate]);

  useEffect(() => { // load the offline OCR once
    const engine = new OcrEngine(); let live = true;
    readers.current = {
      national: new FrameReader(engine, model as unknown as DigitModel),
      employee: new FrameReader(engine, model as unknown as DigitModel, "employee"),
    };
    setReaderState("ready");
    const prewarm = window.setTimeout(() => {
      void engine.load().catch(() => { if (live) setReaderState("failed"); });
    }, 0);
    return () => { live = false; window.clearTimeout(prewarm); void engine.dispose(); };
  }, []);

  const changePhase = useCallback((next: Phase) => { phaseRef.current = next; setPhase(next); }, []);
  const back = useCallback(() => { window.clearTimeout(timer.current); pending.current = null; looked.current.clear(); changePhase({ k: "scanning" }); }, [changePhase]);
  const finish = useCallback((viewData: ScanView, value: string) => {
    ignore.current.set(value, Date.now() + COOLDOWN_MS);
    if (viewData.worker) { ignore.current.set(viewData.worker.nationalId, Date.now() + COOLDOWN_MS); if (viewData.worker.workerId) ignore.current.set(viewData.worker.workerId.toUpperCase(), Date.now() + COOLDOWN_MS); }
    beep(viewData.outcome === "APPROVED" && !viewData.warning ? "ok" : viewData.outcome === "ALREADY_REGISTERED" ? "warn" : "bad", sound);
    changePhase({ k: "result", shown: { kind: "result", view: viewData, value } });
    window.clearTimeout(timer.current); timer.current = window.setTimeout(back, viewData.outcome === "APPROVED" ? 3000 : 6000);
  }, [back, changePhase, sound]);

  const send = useCallback(async (value: string, direction: Direction, opId = newOperationId(), idType: IdType = cardType === "employee" ? "employee" : "auto", scanMethod: ScanMethod = "MANUAL") => {
    pending.current = { opId, value, mode: direction, idType, scanMethod };
    changePhase({ k: "busy", shown: { kind: "checking" } });
    const res = await submitScan(opId, value, direction, gate, () => changePhase({ k: "busy", shown: { kind: "saving" } }), undefined, idType, scanMethod);
    if (res.kind === "done") finish(res.view, value);
    else { beep("bad", sound); window.clearTimeout(timer.current); changePhase({ k: "result", shown: { kind: "error", why: res.kind, value } }); }
  }, [cardType, changePhase, finish, gate, sound]);

  // Preliminary company-code lookups keep the current votes if the worker is unknown.
  const onCandidates = useCallback(async (ready: Candidate[], confirmed: Candidate[], signal?: AbortSignal) => {
    const interrupted = () => signal?.aborted || phaseRef.current.k !== "scanning";
    try {
      for (const c of ready) {
        if (interrupted()) return true;
        if (looked.current.has(c.value)) continue;
        const r = await lookupWorker(c.value, signal, cardType === "employee" ? "employee" : "auto");
        if (interrupted()) return true;
        if (r.found) { await send(c.value, mode, undefined, undefined, "SCANNER"); return true; }
        looked.current.add(c.value);
      }
      if (interrupted()) return true;
      const manual = confirmed.find((c) => c.kind !== "NUMERIC");
      if (manual) {
        const checked = looked.current.has(manual.value);
        changePhase({ k: "manual", value: manual.value, notFound: checked, review: !checked });
        return true;
      }
      for (const c of confirmed) ignore.current.set(c.value, Date.now() + 15000);
      return false;
    } catch {
      if (interrupted()) return true;
      window.clearTimeout(timer.current);
      changePhase({ k: "result", shown: { kind: "error", why: "network", value: ready[0]?.value ?? "" } });
      return true;
    }
  }, [cardType, changePhase, mode, send]);

  const progress = useScanLoop({ video: cam.videoRef, view, enabled: scanning && cam.state === "ready" && readerState === "ready", reader: readers.current?.[cardType] ?? null,
    ignored: (v) => (ignore.current.get(v) ?? 0) > Date.now(),
    onCandidates,
  });

  const retry = () => { const p = pending.current; if (p) void send(p.value, p.mode, p.opId, p.idType, p.scanMethod); else back(); }; // same operationId: never duplicated
  const camMsg = useMemo(() => ({ starting: t("cameraStarting"), denied: t("cameraDenied"), insecure: t("cameraInsecure"), none: t("cameraNone"), error: t("cameraError"), ready: "" })[cam.state], [cam.state, t]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-ink">
      <div className="grid grid-cols-2 gap-2 bg-paper p-2" role="radiogroup" aria-label={t("navScanner")}>
        {(["IN", "OUT"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
            className={`min-h-14 rounded-[3px] border-2 border-ink text-xl font-semibold ${mode === m ? (m === "IN" ? "bg-in text-white" : "bg-out text-ink") : "bg-transparent text-ink"}`}>{m === "IN" ? t("modeIn") : t("modeOut")}</button>
        ))}
      </div>

      {/* <div className="flex flex-wrap items-center gap-2 bg-paper px-2 pb-2">
        <label className="sr-only" htmlFor="card-type">{t("employeeCard")}</label>
        <select id="card-type" className="field !w-auto flex-1" value={cardType} disabled={!scanning} onChange={(e) => { looked.current.clear(); setCardType(e.target.value as CardType); }}>
          <option value="national">{t("nationalCard")}</option>
          <option value="employee">{t("employeeCard")}</option>
        </select>
        {cardType === "employee" && <span className="text-xs text-ink-2">{t("employeeCardHint")}</span>}
      </div> */}

      <div ref={view} className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={cam.videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
        {cam.state === "ready" && scanning && (
          <div aria-hidden className="pointer-events-none absolute border-[3px] border-white shadow-[0_0_0_9999px_rgba(20,33,43,.55)]"
            style={{ left: `${GUIDE.x * 100}%`, width: `${GUIDE.w * 100}%`, height: `${GUIDE.h * 100}%`, top: `${(GUIDE.cy - GUIDE.h / 2) * 100}%` }} />
        )}
        {cam.state === "ready" && scanning && (
          <div className="absolute inset-x-0 bottom-3 px-3 text-center text-white" aria-live="polite">
            <p className="m-0 text-lg font-medium drop-shadow">{readerState === "loading" ? t("readerLoading") : readerState === "failed" ? t("readerFailed") : t(cardType === "employee" ? "employeeGuide" : "scanGuide")}</p>
            {progress && <p dir="ltr" className="num m-0 text-sm opacity-90">{t("reading", { v: progress.value })} ({progress.hits}/{progress.need})</p>}
          </div>
        )}
        {cam.state !== "ready" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white"><div>
            <p className="m-0 mb-4 text-lg">{camMsg}</p>
            {cam.state !== "starting" && <button type="button" className="btn !border-white !text-white hover:!bg-white hover:!text-ink" onClick={cam.retry}>{t("tryAgain")}</button>}
          </div></div>
        )}
        {phase.k === "busy" && <ResultPanel shown={phase.shown} onNext={back} onRetry={retry} />}
        {phase.k === "result" && <ResultPanel shown={phase.shown} onNext={back} onRetry={retry} />}
        {phase.k === "manual" && <ManualEntry initial={phase.review ? "" : phase.value} notFound={phase.notFound} review={phase.review} onCancel={() => { ignore.current.set(phase.value, Date.now() + COOLDOWN_MS); back(); }}
          onSubmit={(v) => void send(v, mode)} onRecordNotFound={(v) => void send(v, mode)} />}
      </div>

      <div className="flex items-center gap-2 bg-paper p-2">
        <button type="button" className="btn !min-h-12 flex-1" onClick={() => changePhase({ k: "manual", value: "", notFound: false })}>{t("typeId")}</button>
        {cam.torchSupported && <button type="button" className="btn !min-h-12" aria-pressed={cam.torchOn} onClick={() => void cam.toggleTorch()}>{cam.torchOn ? t("lightOff") : t("lightOn")}</button>}
        <button type="button" className="btn !min-h-12" aria-pressed={sound} onClick={() => setSound(!sound)}>{sound ? t("soundOn") : t("soundOff")}</button>
        <input className="field !min-h-12 !w-28" aria-label={gate} disabled={true} placeholder={gate} value={gate} maxLength={32} onChange={(e) => setGate(e.target.value)} />
      </div>
    </div>
  );
}
