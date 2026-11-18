import { Link } from "react-router-dom";
import { useState } from "react";
import { useI18n } from "../i18n";
import { fmtClock, fmtDay, fmtNum, shiftDay } from "../lib/format";
import { useSummary } from "../lib/useSummary";
import { Companies } from "../components/Companies";
import { FlowChart } from "../components/FlowChart";
import { Recent } from "../components/Recent";
import { SystemPanel } from "../components/SystemPanel";
import { Tally } from "../components/Tally";
import { post } from "../api";

const Banner = ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => (
  <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 border-s-4 border-block bg-paper px-4 py-3 text-block"><span className="font-medium">{children}</span>{action}</div>
);

export default function Dashboard() {
  const { t, lang } = useI18n();
  const [date, setDate] = useState<string | null>(null); // null = today
  const { data, offline, updated, reload } = useSummary(date);
  const [serverToday, setServerToday] = useState<string | null>(null);
  if (data && date === null && serverToday !== data.day) setServerToday(data.day);
  const day = date ?? data?.day ?? null, isToday = date === null || date === serverToday;
  const go = (d: string) => setDate(d === serverToday ? null : d);

  return (
    <>
      {offline && <Banner>{t("bannerOffline")}</Banner>}
      {data && !data.workers && <Banner>{t("bannerNoWorkers")}</Banner>}
      {data && data.queue.failed > 0 && <Banner action={<button className="btn" onClick={() => void post("/api/queue/retry-failed").then(reload)}>{t("retrySaving")}</button>}>{t("bannerFailed", { n: data.queue.failed })}</Banner>}

      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" className="btn !px-3" aria-label={t("prevDay")} disabled={!day} onClick={() => day && go(shiftDay(day, -1))}>{lang === "ar" ? "›" : "‹"}</button>
        <h1 className="m-0 text-xl font-semibold sm:text-2xl">{day ? fmtDay(day, lang) : t("loading")}</h1>
        <button type="button" className="btn !px-3" aria-label={t("nextDay")} disabled={!day || isToday} onClick={() => day && go(shiftDay(day, 1))}>{lang === "ar" ? "‹" : "›"}</button>
        {!isToday && <button type="button" className="btn" onClick={() => setDate(null)}>{t("backToToday")}</button>}
        <span className="num ms-auto text-sm text-ink-2">{isToday && <><i className="me-1.5 inline-block size-2 rounded-full bg-ok align-middle" />{t("live")}. </>}{updated && t("updated", { time: fmtClock(updated) })}</span>
      </div>

      {!data ? <p className="py-16 text-ink-2" role="status">{t("loading")}</p> : (
        <div className="grid grid-cols-1 gap-10">
          <section className="grid gap-x-10 gap-y-6 grid-cols-1 md:grid-cols-[minmax(200px,280px)_minmax(0,1fr)]" aria-label={t("flowTitle")}>
            <div>
              {isToday && <Link className="text-sm underline" to="/onsite">{t("openOnSite")}</Link>}
              <h2 className="section-title">{isToday ? t("onSiteNow") : t("onSiteEnd")}</h2>
              <p className="num m-0 text-[clamp(4rem,12vw,6.5rem)] font-light leading-none">{fmtNum(data.onSite)}</p>
              <p className="mt-2 text-ink-2">{t("ofCheckedIn", { n: fmtNum(data.checkIns) })}</p>
            </div>
            <div><h2 className="section-title">{t("flowTitle")}</h2><FlowChart hourly={data.hourly} /></div>
          </section>
          <div className="grid gap-x-10 gap-y-10 grid-cols-1 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]"><Tally s={data} /><Companies s={data} /></div>
          <Recent ops={data.recent} onChange={reload} />
          <SystemPanel s={data} today={isToday} onChange={reload} />
        </div>
      )}
    </>
  );
}
