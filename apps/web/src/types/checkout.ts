import type { Decision, ReasonCodeValue, RuleEvaluationTrace } from "@warrant/contracts";

export interface CheckoutProposalItem {
  id: string;
  name: string;
  category: string;
  unitPriceMinor: number;
  quantity: number;
}

export interface CheckoutProposalInput {
  approvalId: string;
  policyVersionId?: string;
  policyHash?: string;
  merchantName: string;
  items: CheckoutProposalItem[];
  currency: string;
  nonce?: string;
  useOfflineSimulation?: boolean;
}

export interface CheckoutGateResult {
  proposalId: string;
  approvalId: string;
  decision: Decision;
  primaryReasonCode: ReasonCodeValue | string;
  reasonCodes: Array<ReasonCodeValue | string>;
  ruleTrace?: RuleEvaluationTrace[];
  cartTotalMinor: number;
  currency: string;
  policyVersionId?: string;
  policyHash?: string;
  reservationId?: string;
  reservationState?: string;
  evaluatedAt: string;
  isLiveApi: boolean;
  isDemoSimulation?: boolean;
}
