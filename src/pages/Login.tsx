import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { LangButton } from "../components/Shell";
import { useI18n } from "../i18n";

export default function Login() {
  const { t } = useI18n(); const { user, login } = useAuth();
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await login(u.trim(), p); }
    catch (x) { setErr(x instanceof ApiError ? (x.status === 429 ? t("tooMany") : x.status === 401 ? t("badCredentials") : t("serverDown")) : t("serverDown")); }
    finally { setBusy(false); }
  }
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-center"><h1 className="m-0 text-2xl font-semibold">{t("appName")}</h1><span className="ms-auto"><LangButton /></span></div>
        <form onSubmit={submit} className="border-t-4 border-ink bg-paper p-5">
          <label className="mb-1 block text-sm font-medium" htmlFor="u">{t("username")}</label>
          <input id="u" className="field mb-4" autoComplete="username" autoCapitalize="none" dir="ltr" value={u} onChange={(e) => setU(e.target.value)} required />
          <label className="mb-1 block text-sm font-medium" htmlFor="p">{t("password")}</label>
          <input id="p" className="field mb-4" type="password" autoComplete="current-password" dir="ltr" value={p} onChange={(e) => setP(e.target.value)} required />
          <div role="alert" className="min-h-6 text-sm text-block">{err}</div>
          <button type="submit" className="btn btn-solid mt-2 w-full !min-h-12" disabled={busy}>{busy ? t("signingIn") : t("signIn")}</button>
        </form>
      </div>
    </div>
  );
}
