import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { Summary } from "../types";

/** Loads the dashboard summary and refreshes it every 10 s while the tab is visible. date=null means "today" (server decides). */
export function useSummary(date: string | null) {
  const [data, setData] = useState<Summary | null>(null);
  const [offline, setOffline] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const s = await api<Summary>(`/api/dashboard/summary${date ? `?date=${date}` : ""}`);
      if (mine !== seq.current) return; // a newer request (e.g. another day) superseded this one
      setData(s); setOffline(false); setUpdated(new Date());
    } catch (e) {
      if (mine === seq.current && !(e instanceof ApiError && e.status === 401)) setOffline(true);
    }
  }, [date]);

  useEffect(() => {
    setData(null); void load();
    const id = setInterval(() => { if (!document.hidden) void load(); }, 10_000);
    return () => clearInterval(id);
  }, [load]);

  return { data, offline, updated, reload: load };
}
