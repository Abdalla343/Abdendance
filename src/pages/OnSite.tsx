import { useEffect, useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import { fmtNum } from "../lib/format";

interface Employee {
  nationalId: string; employeeId: string; name: string; company: string; checkInAt: string;
  checkInTime: string; checkInDate: string; secondsInside: number; scannedBy: string; scannedUsername: string;
}
interface Presence {
  total: number; filtered: number; employees: Employee[]; serverNow: string;
}
const PAGE_SIZE = 100;
const elapsed = (seconds: number) => {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};

export default function OnSite() {
  const { t } = useI18n();
  const [query, setQuery] = useState(""), [search, setSearch] = useState(""), [offset, setOffset] = useState(0);
  const [data, setData] = useState<Presence | null>(null), [offline, setOffline] = useState(false), [loading, setLoading] = useState(true);
  const [received, setReceived] = useState(Date.now()), [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query); setOffset(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    let timer = 0, polling = false;
    setLoading(true);
    async function poll() {
      if (polling || controller.signal.aborted) return;
      polling = true;
      try {
        const result = await api<Presence>(`/api/admin/onsite?search=${encodeURIComponent(search)}&offset=${offset}&limit=${PAGE_SIZE}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setData(result); setReceived(Date.now()); setOffline(false); setLoading(false);
        if (offset > 0 && offset >= result.filtered) setOffset(Math.max(0, Math.floor((result.filtered - 1) / PAGE_SIZE) * PAGE_SIZE));
      } catch {
        if (!controller.signal.aborted) { setOffline(true); setLoading(false); }
      } finally {
        polling = false;
        window.clearTimeout(timer);
        if (!controller.signal.aborted) timer = window.setTimeout(poll, document.hidden ? 15000 : 2000);
      }
    }
    const visible = () => { if (!document.hidden) { window.clearTimeout(timer); timer = window.setTimeout(poll, 2000); } };
    void poll();
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [search, offset]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl bg-ink p-6 text-paper">
        <div><h1 className="m-0 text-2xl font-semibold">{t("onSiteNow")}</h1>
          <p className="mb-0 mt-2 text-sm opacity-75">{t("live")}</p></div>
        <div className="text-end"><p className="num m-0 text-6xl font-light" aria-live="polite">{data ? fmtNum(data.total) : "—"}</p>
          <span className="text-sm opacity-75">{t("total")}</span></div>
      </div>
      {offline && <p role="alert" className="m-0 border-s-4 border-block p-3 text-block">{t("refreshFailed")}</p>}
      <input className="field max-w-lg" aria-label={t("insideSearch")} placeholder={t("insideSearch")} value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading && <p role="status">{t("loading")}</p>}
      {data && <div className="overflow-x-auto rounded-lg border border-rule bg-paper">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-rule bg-ground"><tr>
            {[t("colWorker"), t("colId"), t("colCompany"), t("checkInTime"), t("timeInside"), t("scannedBy")].map((label) =>
              <th className="p-4 text-start text-xs font-semibold uppercase tracking-wide text-ink-2" key={label}>{label}</th>)}
          </tr></thead>
          <tbody>{data.employees.map((employee) => <tr key={employee.nationalId} className="rule-row">
            <td className="p-4 font-medium">{employee.name}</td>
            <td className="num p-4"><div dir="ltr">{employee.employeeId}</div>{employee.employeeId !== employee.nationalId &&
              <div className="mt-1 text-xs text-ink-2" dir="ltr">{employee.nationalId}</div>}</td>
            <td className="p-4">{employee.company}</td>
            <td className="num whitespace-nowrap p-4"><div>{employee.checkInTime}</div><div className="mt-1 text-xs text-ink-2">{employee.checkInDate}</div></td>
            <td className="num whitespace-nowrap p-4"><span className="rounded-full bg-in/10 px-3 py-1 text-in">
              {elapsed(employee.secondsInside + Math.max(0, (now - received) / 1000))}</span></td>
            <td className="p-4">{employee.scannedBy || employee.scannedUsername || "—"}</td>
          </tr>)}</tbody>
        </table>
        {!data.employees.length && <p className="p-6 text-ink-2">{t("insideEmpty")}</p>}
      </div>}
      {data && <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 me-auto text-sm text-ink-2">{t("insideShowing", { shown: data.employees.length, n: data.filtered })}</p>
        <button className="btn" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>{t("previousPage")}</button>
        <button className="btn" disabled={loading || offset + PAGE_SIZE >= data.filtered} onClick={() => setOffset(offset + PAGE_SIZE)}>{t("nextPage")}</button>
      </div>}
    </div>
  );
}
