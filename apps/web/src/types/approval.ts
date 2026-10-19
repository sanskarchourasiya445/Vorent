import type { PersistenceLoadState } from "./persistence";

export interface ApprovalRecord {
  id: string;
  ownerId?: string;
  policyVersionId: string;
  policyHash: string;
  policyName?: string;
  qualifyingTestRunId: string;
  spendLimitMinor: number;
  consumedSpendMinor: number;
  currency: string;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
}

export interface CreateApprovalInput {
  policyVersionId: string;
  policyHash: string;
  qualifyingTestRunId?: string;
  spendLimitMinor: number;
  currency: string;
  expiresInHours: number;
}

export type ApprovalListState = PersistenceLoadState<ApprovalRecord[]>;
