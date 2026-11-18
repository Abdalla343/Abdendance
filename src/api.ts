const KEY = "att.token";
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t: string) => localStorage.setItem(KEY, t);
export const clearToken = () => localStorage.removeItem(KEY);
  const API_URL = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(public status: number, public body: any, message?: string) { super(message ?? body?.error ?? `HTTP ${status}`); }
}
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (f: () => void) => { onUnauthorized = f; };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let res: Response;
  
  const url = `${API_URL}${path}`;

try {
  res = await fetch(url, {
    ...init,
    headers
  });
} catch {
  throw new ApiError(0, null, "network");
}
  //try { res = await fetch(path, { ...init, headers }); } catch { throw new ApiError(0, null, "network"); }
  
  const body = await res.json().catch(() => null);
  if (res.status === 401 && token && !path.startsWith("/api/auth/login")) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
export const post = <T>(path: string, data?: unknown) => api<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });

/** Authenticated file download (a plain link cannot send the Authorization header). */
export async function download(path: string, filename: string) {
  
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
