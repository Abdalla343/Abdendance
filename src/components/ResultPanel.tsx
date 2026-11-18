import { useI18n } from "../i18n";
import { maskId } from "../lib/format";
import type { ScanView } from "../lib/scanApi";

export type Shown =
  | { kind: "checking" } | { kind: "saving" }
  | { kind: "result"; view: ScanView; value: string }
  | { kind: "error"; why: "network" | "failed"; value: string };

const SKIN: Record<string, string> = { APPROVED: "bg-ok text-white", NOT_APPROVED: "bg-block text-white", NOT_FOUND: "bg-notfound text-white", ALREADY_REGISTERED: "bg-warn text-white" };

export function ResultPanel({ shown, onNext, onRetry }: { shown: Shown; onNext: () => void; onRetry: () => void }) {
  const { t } = useI18n();
  if (shown.kind === "checking" || shown.kind === "saving")
    return <div role="status" className="absolute inset-0 z-10 grid place-items-center bg-pending p-6 text-center text-ink"><p className="m-0 text-3xl font-semibold">{shown.kind === "checking" ? t("checking") : t("savingAttendance")}</p></div>;

  if (shown.kind === "error")
    return (
      <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-ink p-6 text-center text-white">
        <p className="m-0 text-4xl font-bold">{t("rError")}</p>
        <p className="m-0 max-w-xs text-lg">{shown.why === "network" ? t("networkMsg") : t("failedMsg")}</p>
        <p className="num m-0 text-xl" dir="ltr">{maskId(shown.value)}</p>
        <button type="button" className="btn !min-h-14 bg-white !px-10 text-lg !text-ink" onClick={onRetry}>{t("retry")}</button>
        <button type="button" className="btn !border-white !text-white" onClick={onNext}>{t("cancel")}</button>
      </div>
    );

  const { view, value } = shown, w = view.worker, big = { APPROVED: t("rApproved"), NOT_APPROVED: t("rBlocked"), NOT_FOUND: t("rNotFound"), ALREADY_REGISTERED: t("rAlready") }[view.outcome];
  const prev = view.previous?.replace(/^IN/, t("dirIn")).replace(/^OUT/, t("dirOut")) ?? "";
  const line = view.outcome === "APPROVED" ? t(view.direction === "IN" ? "entryAt" : "exitAt", { time: view.time })
    : view.outcome === "NOT_APPROVED" ? t(view.rejectionReason === "NO_CHECK_IN" ? "noCheckIn" : "blockedMsg") : view.outcome === "NOT_FOUND" ? t("notFoundMsg") : t("alreadyMsg", { prev });
  return (
    <div role="alert" onClick={onNext} className={`absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center gap-3 p-6 text-center ${SKIN[view.outcome]}`}>
      <p className="m-0 text-[clamp(2.25rem,11vw,4.5rem)] font-bold leading-none">{big}</p>
      {w && <p className="m-0 text-3xl font-semibold">{w.name}</p>}
      {w && <p className="m-0 text-xl opacity-90">{w.company}{w.jobTitle ? `, ${w.jobTitle}` : ""}</p>}
      <p dir="ltr" className="num m-0 text-lg opacity-90">{maskId(w?.nationalId ?? value)}{w?.workerId ? `  ${w.workerId}` : ""}</p>
      <p className="m-0 text-xl">{line}</p>
      {view.outcome === "NOT_APPROVED" && w?.terminationReason && <p className="m-0 text-lg">{t("blockedReason", { r: w.terminationReason })}</p>}
      {view.warning && <p className="m-0 text-lg">{t("warnRepeat", { prev })}</p>}
      <button type="button" className="btn mt-3 !min-h-14 !border-white !px-10 text-lg !text-white hover:!bg-white hover:!text-ink" onClick={onNext}>{t("scanNext")}</button>
    </div>
  );
}
