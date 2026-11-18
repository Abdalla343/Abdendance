import { useState } from "react";
import { download, post } from "../api";
import { useI18n } from "../i18n";
import { fmtBytes, fmtNum, fmtStamp } from "../lib/format";
import type { FileInfo, Summary } from "../types";
import { WorkersUpload } from "./WorkersUpload";

const Row = ({ label, children, tone }: { label: string; children: React.ReactNode; tone?: string }) => (
  <div className="rule-row flex items-baseline gap-3 py-2"><dt className="text-[15px]">{label}</dt><dd className={`num m-0 ms-auto text-end ${tone ?? ""}`}>{children}</dd></div>
);
const h3 = "mb-1 text-[15px] font-semibold";

export function SystemPanel({ s, today, onChange }: { s: Summary; today: boolean; onChange: () => void }) {
  const { t, lang } = useI18n(); const [retrying, setRetrying] = useState(false); const [fileError, setFileError] = useState(false);
  const dateKey = `${s.day.slice(8)}-${s.day.slice(5, 7)}-${s.day.slice(0, 4)}`;
  const fileRow = (label: string, f: FileInfo, dir: "IN" | "OUT") => (
    <Row key={dir} label={label}>
      {f.exists
        ? <span className="inline-flex flex-wrap items-center justify-end gap-x-3"><bdi dir="ltr">{fmtBytes(f.bytes ?? 0)}</bdi>
            <button type="button" className="btn !min-h-8 !px-3" onClick={() => void download(`/api/attendance/file?date=${dateKey}&dir=${dir}`, `${dateKey}${dir === "IN" ? "CheckIn" : "CheckOut"}.xlsx`)}>{t("download")}</button></span>
        : <span className="text-ink-2">{t("fileMissing")}</span>}
    </Row>
  );
  const w = s.workers;
  return (
    <section aria-labelledby="system">
      <h2 id="system" className="section-title">{t("systemTitle")}</h2>
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-3">
        <div>
          <h3 className={h3}>{t("queueTitle")}</h3>
          <dl className="m-0">
            <Row label={t("waiting")}>{fmtNum(s.queue.pending)}</Row>
            <Row label={t("failed")} tone={s.queue.failed ? "font-semibold text-block" : ""}>{fmtNum(s.queue.failed)}</Row>
          </dl>
          {s.queue.failed > 0 && <button type="button" className="btn btn-solid mt-3" disabled={retrying}
            onClick={async () => { setRetrying(true); try { await post("/api/queue/retry-failed"); onChange(); } finally { setRetrying(false); } }}>{retrying ? t("retrying") : t("retrySaving")}</button>}
        </div>
        <div>
          <h3 className={h3}>{t("filesTitle")}</h3>
          <dl className="m-0">{fileRow(t("fileCheckIn"), s.files.checkIn, "IN")}{fileRow(t("fileCheckOut"), s.files.checkOut, "OUT")}</dl>
          <button className="btn mt-3" onClick={() => void download("/api/attendance/rejected", "Rejected.xlsx").catch(() => setFileError(true))}>{t("rejectedFile")}</button>
          {fileError && <p role="alert" className="text-block">{t("downloadFailed")}</p>}
        </div>
        <div>
          <h3 className={h3}>{t("workersTitle")}</h3>
          <dl className="m-0">
            <Row label={t("wRegistered")}>{w ? fmtNum(w.total) : t("wNone")}</Row>
            <Row label={t("wActive")}>{w ? fmtNum(w.valid) : "-"}</Row>
            <Row label={t("wTerminated")}>{w ? fmtNum(w.terminated) : "-"}</Row>
          </dl>
          {w && <p className="mb-0 mt-1 text-sm text-ink-2">{t("wLoaded", { time: fmtStamp(w.loadedAt, lang) })}</p>}
          {today && <div className="mt-3"><WorkersUpload onDone={onChange} /></div>}
        </div>
      </div>
    </section>
  );
}
