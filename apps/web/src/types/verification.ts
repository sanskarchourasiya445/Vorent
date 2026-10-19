import type {
  Decision,
  PolicyEvaluationResult,
  Cart,
  EvidenceSnapshot,
  PolicyDocument,
  ConfirmedIntent,
  StopReason,
} from "@warrant/contracts";

export type VerificationStatus =
  | "IDLE"
  | "RUNNING"
  | "COMPLETED"
  | "BUDGET_EXHAUSTED"
  | "UNRESOLVED_CASES"
  | "FAILED";

export type SearchDimension =
  | "PRICE_BOUNDARIES"
  | "CATEGORY_EVASION"
  | "CURRENCY_MUTATION"
  | "EVIDENCE_FRESHNESS"
  | "QUANTITY_SPLITS";

export interface PolicyOption {
  id: string;
  version: string;
  name: string;
  hash: string;
  description: string;
  limitsSummary: string;
  policyDocument: PolicyDocument;
  intent: ConfirmedIntent;
  defaultCategories: string[];
  defaultPricePointsMinor: number[];
}

export interface VerificationConfig {
  policyVersionId: string;
  policyHash?: string;
  dimensions: SearchDimension[];
  candidateBudget: number;
}

export type FindingClassification =
  | "COUNTEREXAMPLE" // Confirmed policy loophole / violation
  | "UNRESOLVED_AMBIGUITY"; // Ambiguous or missing evidence held in fail-closed state (NOT a proven vulnerability)

export interface VerificationFinding {
  id: string;
  title: string;
  summary: string;
  classification: FindingClassification;
  expectedDecision: Decision;
  actualResult: PolicyEvaluationResult;
  candidateCart: Cart;
  candidateEvidence?: EvidenceSnapshot;
  reproductionNotes: string[];
}

export interface VerificationCoverage {
  totalCandidatesEvaluated: number;
  candidateBudget: number;
  isExhaustive: boolean; // true = search space completely exhausted; false = budget bound reached
  dimensionsCovered: SearchDimension[];
  evaluatedAt: string;
  durationMs: number;
}

export interface VerificationRunResult {
  runId: string;
  status: VerificationStatus;
  policyVersionId: string;
  policyHash: string;
  coverage: VerificationCoverage;
  findings: VerificationFinding[];
  counterexampleCount: number;
  unresolvedCount: number;
  stopReason?: StopReason | string;
  summary?: string;
  isLiveApi?: boolean;
  isDemoFixture?: boolean;
  errorMessage?: string;
}

