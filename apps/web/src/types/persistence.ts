import type { StopReason, RunStatus } from "@warrant/contracts";

export interface PersistedPolicyVersionSummary {
  id: string;
  policyId: string;
  versionNumber: number;
  policyHash: string;
  name: string;
  confirmationState: "DRAFT" | "CONFIRMED";
  createdAt: string;
}

export interface SavedVerificationRunSummary {
  runId: string;
  id?: string;
  policyVersionId: string;
  policyVersionNumber?: number;
  policyName?: string;
  policyHash: string;
  status: RunStatus;
  stopReason?: StopReason | string | null;
  exhausted: boolean;
  totalCandidatesExplored: number;
  findingCount: number;
  unresolvedCount?: number;
  durationMs: number;
  createdAt: string;
  summary?: string;
}

export type PersistenceLoadState<T> =
  | { state: "IDLE" }
  | { state: "LOADING" }
  | { state: "READY"; data: T }
  | { state: "EMPTY" }
  | { state: "UNAVAILABLE"; message: string }
  | { state: "ERROR"; message: string };
