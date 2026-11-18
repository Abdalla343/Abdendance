import { useCallback, useEffect, useState } from "react";
import { api, ApiError, post } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import type { User } from "../types";

interface ManagedUser extends User { active: number }
export default function Users() {
  const { t } = useI18n(), { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState(""), [displayName, setDisplayName] = useState(""), [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [message, setMessage] = useState(""), [deleting, setDeleting] = useState<number | null>(null);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const result = await api<{ users: ManagedUser[] }>("/api/admin/users", { signal });
    setUsers(result.users);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal).catch(() => { if (!controller.signal.aborted) setError(t("serverDown")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, t]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); await reload(); }
    catch (e) { setError(e instanceof ApiError ? e.body?.error || t("userActionFailed") : t("serverDown")); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-8">
      <h1 className="m-0 text-2xl font-semibold">{t("usersTitle")}</h1>
      {error && <p role="alert" className="m-0 text-block">{error}</p>}
      {message && <p role="status" className="m-0 text-in">{message}</p>}
      <form className="grid gap-4 rounded-lg border border-rule bg-paper p-5 md:grid-cols-3" onSubmit={(e) => {
        e.preventDefault();
        void mutate(async () => {
          await post("/api/admin/users", { username, displayName, password, role: "USER" });
          setUsername(""); setDisplayName(""); setPassword("");
        }, t("userCreated"));
      }}>
        <label className="grid gap-1 text-sm">{t("username")}
          <input className="field" dir="ltr" autoComplete="off" required pattern="[A-Za-z0-9._\-]{3,32}" maxLength={32} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">{t("displayName")}
          <input className="field" required maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">{t("password")}
          <input className="field" dir="ltr" type="password" required autoComplete="new-password" minLength={10} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <p className="m-0 text-sm text-ink-2 md:col-span-2">{t("passwordHint")}</p>
        <button className="btn btn-solid" disabled={busy}>{busy ? t("savingAttendance") : t("createUser")}</button>
      </form>
      {loading ? <p role="status">{t("loading")}</p> : (
        <div className="overflow-x-auto rounded-lg border border-rule bg-paper p-4">
          <table className="w-full text-start">
            <thead><tr className="border-b border-rule">
              {[t("username"), t("displayName"), t("userRole"), t("colResult"), t("deleteUser")].map((label) =>
                <th className="p-3 text-start text-sm font-medium text-ink-2" key={label}>{label}</th>)}
            </tr></thead>
            <tbody>{users.map((item) => <tr className="rule-row" key={item.id}>
              <td className="p-3" dir="ltr">{item.username}</td><td className="p-3">{item.displayName || item.username}</td>
              <td className="p-3">{item.role === "ADMIN" ? t("adminRole") : t("securityRole")}</td>
              <td className="p-3">{item.active ? t("userActive") : t("userDisabled")}</td>
              <td className="p-3">{item.id !== user?.id && (deleting === item.id
                ? <div className="flex flex-wrap gap-2">
                    <button className="btn border-block text-block" disabled={busy} onClick={() => void mutate(async () => {
                      await api("/api/admin/users/" + item.id, { method: "DELETE" }); setDeleting(null);
                    }, t("userDeleted"))}>{t("confirmDelete")}</button>
                    <button className="btn" disabled={busy} onClick={() => setDeleting(null)}>{t("cancel")}</button>
                  </div>
                : <button className="btn" disabled={busy} onClick={() => setDeleting(item.id)}>{t("deleteUser")}</button>)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
