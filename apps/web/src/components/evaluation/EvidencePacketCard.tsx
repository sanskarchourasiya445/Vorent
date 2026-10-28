import { useState } from "react";
import {
  PackageCheck,
  Download,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  AlertCircle,
  Lock,
  ChevronDown,
  ChevronUp,
  FileCode,
  ExternalLink,
} from "lucide-react";
import type { EvidencePacketLoadResult } from "../../types/evaluation";
import { downloadEvidencePacket } from "../../api/evaluationService";
import { Skeleton, SkeletonCodeBlock } from "../ui/Skeleton";

interface EvidencePacketCardProps {
  packetResult: EvidencePacketLoadResult;
  isLoading: boolean;
  onRefresh: (targetParams?: { entityType?: string; entityId?: string }) => void;
  onNavigateWorkstation?: (workstationId: string) => void;
}

export function EvidencePacketCard({
  packetResult,
  isLoading,
  onRefresh,
  onNavigateWorkstation,
}: EvidencePacketCardProps) {
  const [selectedEntityType, setSelectedEntityType] = useState<"POLICY_VERSION" | "CHECKOUT_PROPOSAL" | "PAYMENT_ORDER">("POLICY_VERSION");
  const [targetEntityId, setTargetEntityId] = useState("pol_v1_books_hardware");
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const packet = packetResult.packet;

  const handleCopyHash = () => {
    if (packet?.packetHash) {
      navigator.clipboard.writeText(packet.packetHash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const handleCopyJson = () => {
    if (packet) {
      navigator.clipboard.writeText(JSON.stringify(packet, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  const handleExportDownload = () => {
    setExportError(null);
    if (!packet) {
      setExportError("Cannot export: No verified evidence packet available from backend.");
      return;
    }

    try {
      downloadEvidencePacket(packet);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PASS":
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-allow" aria-hidden="true" />,
          label: "VERIFIED PASS",
          className: "bg-allow/10 text-allow border-allow/30",
        };
      case "FAIL":
        return {
          icon: <XCircle className="w-4 h-4 text-deny" aria-hidden="true" />,
          label: "VERIFICATION FAILED",
          className: "bg-deny/10 text-deny border-deny/30",
        };
      case "WARNING":
        return {
          icon: <AlertTriangle className="w-4 h-4 text-warning" aria-hidden="true" />,
          label: "WARNING / CAVEATS",
          className: "bg-warning/10 text-warning border-warning/30",
        };
      case "UNTESTED":
      default:
        return {
          icon: <HelpCircle className="w-4 h-4 text-muted" aria-hidden="true" />,
          label: "UNTESTED",
          className: "bg-surface-inset text-muted border-border",
        };
    }
  };

  return (
    <div className="border border-border rounded bg-surface shadow-xs overflow-hidden" data-testid="evidence-packet-card">
      {/* Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-border bg-surface space-y-4">
        {/* Full-width Title & Description */}
        <div className="w-full">
          <div className="flex flex-wrap items-center gap-2">
            <PackageCheck className="w-5 h-5 text-accent shrink-0" aria-hidden="true" />
            <h2 className="text-base font-semibold text-ink tracking-tight font-sans">
              Cryptographic Evidence Packet &amp; Attestation
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent/10 text-accent font-semibold border border-accent/20">
              v1.0.0
            </span>
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed font-sans max-w-4xl">
            Tamper-evident, reproducible attestation bundle binding mandate intent, cryptographic policy SHA-256 digest, bounded verification proof, buyer approvals, gate nonces, and PayPal Sandbox reconciliation.
          </p>
        </div>

        {/* Full-width Responsive Control Ribbon */}
        <div className="pt-3 border-t border-border/60 flex flex-col xl:flex-row xl:items-center justify-between gap-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1">
            <div className="inline-flex flex-wrap items-center gap-1.5 bg-surface-inset px-2.5 py-1.5 rounded border border-border text-xs min-w-0 max-w-full">
              <span className="text-[11px] font-semibold text-muted uppercase font-mono shrink-0">Target:</span>
              <select
                value={selectedEntityType}
                onChange={(e) => {
                  const val = e.target.value as "POLICY_VERSION" | "CHECKOUT_PROPOSAL" | "PAYMENT_ORDER";
                  setSelectedEntityType(val);
                  if (val === "POLICY_VERSION") {
                    setTargetEntityId("pol_v1_books_hardware");
                  } else if (val === "CHECKOUT_PROPOSAL") {
                    setTargetEntityId("prop_sample_id");
                  } else {
                    setTargetEntityId("ord_sample_id");
                  }
                }}
                className="px-2 py-1 rounded bg-surface border border-border text-ink text-xs font-mono cursor-pointer min-w-0 max-w-full focus:outline-none focus:ring-1 focus:ring-accent"
                data-testid="target-entity-type-select"
              >
                <option value="POLICY_VERSION">Policy Version (/policies/:versionId)</option>
                <option value="CHECKOUT_PROPOSAL">Proposal (/proposals/:id)</option>
                <option value="PAYMENT_ORDER">Order (/orders/:id)</option>
              </select>
              <input
                type="text"
                value={targetEntityId}
                onChange={(e) => setTargetEntityId(e.target.value)}
                placeholder="Identifier"
                className="px-2 py-1 rounded bg-surface border border-border text-ink text-xs font-mono w-48 min-w-[120px] max-w-full focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
                data-testid="target-entity-id-input"
              />
            </div>

            {/* Quick Target Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
              <span className="text-muted text-[10px] uppercase font-semibold shrink-0">Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedEntityType("POLICY_VERSION");
                  setTargetEntityId("pol_v1_books_hardware");
                  onRefresh({ entityType: "POLICY_VERSION", entityId: "pol_v1_books_hardware" });
                }}
                className="px-1.5 py-0.5 rounded bg-surface-inset hover:bg-surface-raised border border-border text-ink transition-colors cursor-pointer text-[11px]"
              >
                pol_v1_books_hardware
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedEntityType("CHECKOUT_PROPOSAL");
                  setTargetEntityId("prop_sample_id");
                  onRefresh({ entityType: "CHECKOUT_PROPOSAL", entityId: "prop_sample_id" });
                }}
                className="px-1.5 py-0.5 rounded bg-surface-inset hover:bg-surface-raised border border-border text-ink transition-colors cursor-pointer text-[11px]"
              >
                prop_sample_id
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedEntityType("PAYMENT_ORDER");
                  setTargetEntityId("ord_sample_id");
                  onRefresh({ entityType: "PAYMENT_ORDER", entityId: "ord_sample_id" });
                }}
                className="px-1.5 py-0.5 rounded bg-surface-inset hover:bg-surface-raised border border-border text-ink transition-colors cursor-pointer text-[11px]"
              >
                ord_sample_id
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onRefresh({ entityType: selectedEntityType, entityId: targetEntityId.trim() })}
              disabled={isLoading || !targetEntityId.trim()}
              className="px-3.5 py-1.5 rounded text-xs font-mono font-semibold bg-surface border border-border text-ink hover:bg-surface-raised transition-all inline-flex items-center space-x-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
              data-testid="refresh-packet-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
              <span>Load / Refresh Packet</span>
            </button>

            <button
              type="button"
              onClick={handleExportDownload}
              disabled={!packet || isLoading}
              className={`px-3.5 py-1.5 rounded text-xs font-mono font-semibold transition-all inline-flex items-center space-x-1.5 shadow-xs cursor-pointer ${
                packet
                  ? "bg-accent text-white hover:bg-accent/90 active:bg-accent/95"
                  : "bg-surface-inset text-muted/60 border border-border cursor-not-allowed opacity-60"
              }`}
              data-testid="export-packet-btn"
              title={packet ? "Download evidence packet as JSON file" : "Export disabled: No verified packet available from backend"}
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{packet ? "Export Evidence Packet (JSON)" : "Export Unavailable"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Export Error Alert */}
      {exportError && (
        <div className="m-4 p-3 rounded-lg bg-deny/10 border border-deny/30 text-deny text-xs flex items-center justify-between font-mono" role="alert">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-deny shrink-0" aria-hidden="true" />
            <span>{exportError}</span>
          </div>
          <button type="button" onClick={() => setExportError(null)} className="text-deny font-bold hover:underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Database Standby Banner */}
      {packetResult.state === "STANDBY" && (
        <div className="m-4 p-4 rounded-lg bg-warning/10 border border-warning/30 text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs" role="alert" data-testid="packet-standby-banner">
          <div className="flex items-start sm:items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
            <div>
              <span className="font-bold font-mono">Database Persistence in Standby: </span>
              <span className="font-sans text-muted">{packetResult.message || "PostgreSQL database in standby mode. Persisted evidence packets require connected persistence."}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRefresh({ entityType: selectedEntityType, entityId: targetEntityId.trim() })}
            className="px-3 py-1 rounded bg-warning/20 hover:bg-warning/30 text-ink border border-warning/40 font-semibold text-xs transition-colors shrink-0 self-start sm:self-auto cursor-pointer"
          >
            Retry Retrieval
          </button>
        </div>
      )}

      {/* Unavailable State Banner */}
      {packetResult.state === "UNAVAILABLE" && (
        <div className="m-4 p-4 rounded-lg bg-surface-inset border border-border text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs" role="alert" data-testid="packet-unavailable-banner">
          <div className="flex items-start sm:items-center space-x-2.5">
            <HelpCircle className="w-4 h-4 text-muted shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
            <div>
              <span className="font-bold font-mono">Evidence Packet Endpoint Not Available: </span>
              <span className="font-sans text-muted">{packetResult.message || "Evidence packet endpoint (/api/evidence-packets/policies/:versionId, /proposals/:id, /orders/:id) returned 404 or is not available. Live export is disabled; unverified packets are never fabricated."}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRefresh({ entityType: selectedEntityType, entityId: targetEntityId.trim() })}
            className="px-3 py-1 rounded bg-surface border border-border hover:bg-surface-raised text-ink font-semibold text-xs transition-colors shrink-0 self-start sm:self-auto cursor-pointer"
          >
            Retry Probe
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="p-4 sm:p-5 space-y-4" data-testid="packet-loading">
          <div className="p-3 rounded-lg border border-border bg-surface-inset text-center text-muted flex items-center justify-center space-x-2.5">
            <RefreshCw className="w-4 h-4 animate-spin text-accent" aria-hidden="true" />
            <p className="text-xs font-medium font-mono">Assembling cryptographic evidence packet from backend...</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Skeleton variant="rectangular" className="h-14 rounded-lg" />
            <Skeleton variant="rectangular" className="h-14 rounded-lg" />
            <Skeleton variant="rectangular" className="h-14 rounded-lg" />
          </div>
          <SkeletonCodeBlock lines={7} />
        </div>
      ) : !packet ? (
        <div className="p-8 text-center border-t border-border bg-surface-inset" data-testid="packet-empty-state">
          <ShieldCheck className="w-8 h-8 text-muted/60 mx-auto mb-2" aria-hidden="true" />
          <h3 className="text-xs font-bold text-ink font-mono">Zero Evidence Packets Loaded</h3>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto font-sans">
            No valid evidence packet is currently returned by the backend. When a policy verification run or checkout proposal completes with verifiable proof, the authoritative evidence packet will appear here for inspection and export.
          </p>
        </div>
      ) : (
        /* Verified Evidence Packet Display */
        <div className="p-4 sm:p-5 space-y-5" data-testid="packet-content">
          {/* Top Verification Status Bar */}
          <div className="p-3.5 rounded bg-surface-inset border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
              <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-xs font-semibold border shrink-0 ${getStatusBadge(packet.overallStatus).className}`}>
                {getStatusBadge(packet.overallStatus).icon}
                <span>{getStatusBadge(packet.overallStatus).label}</span>
              </span>
              <span className="text-muted font-mono text-[11px] truncate min-w-0">
                Packet ID: <strong className="text-ink">{packet.packetId}</strong>
              </span>
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-muted font-mono shrink-0">
              <span>Generated: {new Date(packet.generatedAt).toLocaleString()}</span>
            </div>
          </div>

          {/* SHA-256 Digest Box */}
          <div className="p-3 rounded bg-surface-inset border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <div className="flex items-center space-x-1.5 shrink-0">
                <Lock className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
                <span className="font-semibold text-ink uppercase tracking-wider text-[11px] font-mono">
                  SHA-256 Packet Digest:
                </span>
              </div>
              <span className="font-mono text-[11px] text-ink break-all select-all font-semibold min-w-0" data-testid="packet-hash">
                {packet.packetHash}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyHash}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-surface border border-border text-ink hover:bg-surface-raised transition-colors text-[11px] font-mono font-medium shrink-0 self-start sm:self-auto cursor-pointer"
              data-testid="copy-hash-btn"
            >
              {copiedHash ? (
                <>
                  <Check className="w-3 h-3 text-emerald-700 dark:text-allow" aria-hidden="true" />
                  <span className="text-emerald-700 dark:text-allow font-semibold">Copied Digest</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-muted" aria-hidden="true" />
                  <span>Copy Digest</span>
                </>
              )}
            </button>
          </div>

          {/* 4 Dimension Evidence Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Dimension 1: Target & Mandate Provenance */}
            <div className="p-4 rounded bg-surface border border-border shadow-xs space-y-2">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block font-mono">
                1. Mandate &amp; Target Provenance
              </span>
              <div>
                <span className="text-muted block text-[11px]">Target Entity:</span>
                <span className="font-mono font-bold text-ink">
                  {packet.target.entityType} ({packet.target.entityId})
                </span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Source Mandate:</span>
                <p className="text-ink font-medium leading-relaxed bg-surface-inset p-2 rounded border border-border text-[11px]">
                  &ldquo;{packet.mandateProvenance.sourceMandate}&rdquo;
                </p>
              </div>
              {packet.mandateProvenance.intentSpec && Object.keys(packet.mandateProvenance.intentSpec).length > 0 && (
                <div>
                  <span className="text-muted block text-[11px]">Intent Specification:</span>
                  <pre data-lenis-prevent className="p-2 rounded bg-surface-inset border border-border font-mono text-[10px] text-muted overflow-x-auto max-h-24">
                    {JSON.stringify(packet.mandateProvenance.intentSpec, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Dimension 2: Policy Identity & Hash Binding */}
            <div className="p-4 rounded bg-surface border border-border shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block font-mono">
                  2. Policy Identity &amp; Hash
                </span>
                {onNavigateWorkstation && (
                  <button
                    type="button"
                    onClick={() => onNavigateWorkstation("policies")}
                    className="text-[11px] text-accent hover:text-accent/80 hover:underline inline-flex items-center space-x-0.5 cursor-pointer font-mono font-medium"
                  >
                    <span>View Versions</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div>
                <span className="text-muted block text-[11px]">Policy Version:</span>
                <span className="font-mono font-bold text-ink">
                  {packet.policyIdentity.policyId} (v{packet.policyIdentity.versionNumber})
                </span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Policy Version ID:</span>
                <span className="font-mono text-muted text-[11px]">{packet.policyIdentity.policyVersionId}</span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">SHA-256 Policy Hash:</span>
                <span className="font-mono text-[10px] text-ink break-all select-all font-semibold bg-surface-inset p-2 rounded border border-border block">
                  {packet.policyIdentity.policyHash}
                </span>
              </div>
            </div>

            {/* Dimension 3: Bounded Search Verification Proof */}
            <div className="p-4 rounded bg-surface border border-border shadow-xs space-y-2">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block font-mono">
                3. Bounded Verification Proof
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-muted block">Qualifying Run:</span>
                  <span className="font-mono font-bold text-ink">
                    {packet.verificationProof.qualifyingTestRunId || "Built-in Fixture"}
                  </span>
                </div>
                <div>
                  <span className="text-muted block">Run Status:</span>
                  <span className="font-bold text-allow font-mono">
                    {packet.verificationProof.testRunStatus}
                  </span>
                </div>
                <div>
                  <span className="text-muted block">Explored Candidates:</span>
                  <span className="font-mono font-bold text-ink">
                    {packet.verificationProof.candidatesExplored} (Domain v{packet.verificationProof.domainVersion})
                  </span>
                </div>
                <div>
                  <span className="text-muted block">Zero Critical Findings:</span>
                  <span className="font-bold text-allow font-mono">
                    {packet.verificationProof.zeroCriticalFindingsVerified ? "YES (Verified)" : "NO"}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Scope Limitations:</span>
                <p className="text-muted italic text-[11px] leading-relaxed font-sans">
                  {packet.verificationProof.searchLimitations}
                </p>
              </div>
            </div>

            {/* Dimension 4: Checkout Decision & Payment Lifecycle */}
            <div className="p-4 rounded bg-surface border border-border shadow-xs space-y-2">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block font-mono">
                4. Gate Decision &amp; PayPal Lifecycle
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-muted block">Decision:</span>
                  <span className={`font-bold font-mono ${packet.checkoutEvaluation?.decision === "ALLOW" ? "text-allow" : "text-deny"}`}>
                    {packet.checkoutEvaluation?.decision || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-muted block">Provider:</span>
                  <span className="font-mono font-bold text-ink">
                    {packet.paymentLifecycle?.provider || "PAYPAL_SANDBOX"}
                  </span>
                </div>
                <div>
                  <span className="text-muted block">Payment Order ID:</span>
                  <span className="font-mono font-bold text-ink">
                    {packet.paymentLifecycle?.paymentOrderId || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-muted block">Reservation State:</span>
                  <span className="font-mono font-bold text-ink">
                    {packet.paymentLifecycle?.reservationState || "N/A"}
                  </span>
                </div>
              </div>
              {packet.paymentLifecycle?.providerOrderId && (
                <div>
                  <span className="text-muted block text-[11px]">PayPal Provider Order ID:</span>
                  <span className="font-mono text-muted text-[11px]">{packet.paymentLifecycle.providerOrderId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Redaction Notice */}
          <div className="p-3 rounded bg-surface-inset border border-border text-xs text-muted flex items-start space-x-2">
            <Lock className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="text-ink">Redaction &amp; Privacy Notice: </strong>
              <span className="font-sans">{packet.redactionNotice}</span>
            </div>
          </div>

          {/* Raw JSON Inspector Accordion */}
          <div className="pt-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowRawJson(!showRawJson)}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-accent hover:text-accent/80 hover:underline transition-colors cursor-pointer font-mono"
                aria-expanded={showRawJson}
                data-testid="toggle-raw-json-btn"
              >
                <FileCode className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showRawJson ? "Hide Raw Evidence Packet JSON" : "Inspect Raw Evidence Packet JSON"}</span>
                {showRawJson ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
              </button>

              {showRawJson && (
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center space-x-1 text-[11px] font-mono font-medium text-muted hover:text-ink transition-colors px-2.5 py-1 rounded bg-surface border border-border hover:bg-surface-raised cursor-pointer"
                  data-testid="copy-raw-json-btn"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-700 dark:text-allow" aria-hidden="true" />
                      <span className="text-emerald-700 dark:text-allow font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-muted" aria-hidden="true" />
                      <span>Copy Full JSON</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {showRawJson && (
              <pre
                data-lenis-prevent
                className="mt-3 p-4 rounded-lg bg-surface-inset border border-border text-[11px] font-mono text-ink w-full max-w-full overflow-x-auto whitespace-pre-wrap break-words sm:whitespace-pre sm:break-normal max-h-96 animate-in fade-in duration-150"
                data-testid="raw-packet-json"
              >
                {JSON.stringify(packet, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
