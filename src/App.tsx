import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { Shell } from "./components/Shell";
import { I18nProvider, useI18n } from "./i18n";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Scanner from "./pages/Scanner";
import Users from "./pages/Users";
import OnSite from "./pages/OnSite";

function Gate({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth(); const { t } = useI18n();
  if (loading) return <p className="p-8" role="status">{t("loading")}</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "ADMIN") return <Navigate to="/scan" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <I18nProvider><AuthProvider><BrowserRouter><Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/scan" element={<Gate><Shell flush><Scanner /></Shell></Gate>} />
      <Route path="/users" element={<Gate admin><Shell><Users /></Shell></Gate>} />
      <Route path="/onsite" element={<Gate admin><Shell><OnSite /></Shell></Gate>} />
      <Route path="*" element={<Gate admin><Shell search><Dashboard /></Shell></Gate>} />
    </Routes></BrowserRouter></AuthProvider></I18nProvider>
  );
}
