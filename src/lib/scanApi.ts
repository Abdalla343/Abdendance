import { ApiError, api, post } from "../api";
import { maskId } from "./format";

export interface WorkerView { nationalId: string; workerId: string; name: string; jobTitle: string; company: string; status: string; terminationReason?: string }
export interface ScanView {
  operationId: string; state: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; direction: "IN" | "OUT"; date: string; time: string;
  scanMethod?: ScanMethod; rejectionReason?: "NO_CHECK_IN";
  outcome: "APPROVED" | "NOT_APPROVED" | "NOT_FOUND" | "ALREADY_REGISTERED"; warning?: string; previous?: string; worker?: WorkerView;
}
export type ScanMethod = "SCANNER" | "MANUAL" | "UNKNOWN";
export type IdType = "auto" | "employee";
export type Direction = "IN" | "OUT";

/** Unique id for one scan attempt. Re-used when retrying so the server can never record it twice. */
export function newOperationId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export const lookupWorker = (id: string, signal?: AbortSignal, idType: IdType = "auto") => api<{ found: boolean; approved?: boolean; worker?: WorkerView }>(`/api/workers/lookup?id=${encodeURIComponent(id)}${idType === "employee" ? "&type=employee" : ""}`, { signal });

export type SubmitResult = { kind: "done"; view: ScanView } | { kind: "failed"; view: ScanView } | { kind: "network" };

/** Sends a scan and waits until the server reports it COMPLETED or FAILED (success is never assumed). */
export async function submitScan(opId: string, idNumber: string, direction: Direction, gateId: string, onSaving: () => void, signal?: AbortSignal, idType: IdType = "auto", scanMethod: ScanMethod = "UNKNOWN"): Promise<SubmitResult> {
  try {
    let view: ScanView;
    try { view = await post<ScanView>("/api/scans", { operationId: opId, idNumber, direction, gateId: gateId || undefined, ...(scanMethod !== "UNKNOWN" ? { scanMethod } : {}), ...(idType === "employee" ? { idType } : {}) }); }
    catch (e) { if (e instanceof ApiError && e.status === 500 && e.body?.state) return { kind: "failed", view: e.body }; throw e; }
    if (view.state === "COMPLETED") return { kind: "done", view };
    onSaving();
    for (let i = 0; i < 60; i++) { // poll up to ~30 s
      if (signal?.aborted) return { kind: "network" };
      await new Promise((r) => setTimeout(r, 500));
      try { view = await api<ScanView>(`/api/scans/${opId}`); }
      catch (e) { if (e instanceof ApiError && e.status === 500 && e.body?.state) return { kind: "failed", view: e.body }; throw e; }
      if (view.state === "COMPLETED") return { kind: "done", view };
      if (view.state === "FAILED") return { kind: "failed", view };
    }
    return { kind: "network" };
  } catch { return { kind: "network" }; }
}
export { maskId };
