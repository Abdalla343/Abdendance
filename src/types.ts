export type Outcome = "APPROVED" | "NOT_APPROVED" | "NOT_FOUND" | "ALREADY_REGISTERED";
export interface FileInfo { exists: boolean; bytes?: number; modified?: string }
export interface Op {
  operationId: string; time: string; date: string; direction: "IN" | "OUT"; outcome: Outcome; state: string;
  nationalId: string; name: string | null; company: string | null; gate: string; scanMethod?: "SCANNER" | "MANUAL" | "UNKNOWN"; rejectionReason?: "NO_CHECK_IN"; scannedBy?: string; scannedUsername?: string; warning?: string;
}
export interface Summary {
  day: string;
  workers: null | { loadedAt: string; source: string; total: number; valid: number; terminated: number; warningCount: number };
  workersByCompany: Record<string, { valid: number; terminated: number }>;
  checkIns: number; checkOuts: number; onSite: number;
  rejected: { notApproved: number; notFound: number; alreadyRegistered: number };
  queue: { pending: number; failed: number };
  byCompany: { company: string; checkIns: number; checkOuts: number; onSite: number }[];
  hourly: { hour: string; checkIns: number; checkOuts: number }[];
  files: { checkIn: FileInfo; checkOut: FileInfo };
  recent: Op[];
}
export interface User { id: number; username: string; displayName?: string; role: "ADMIN" | "USER" }
