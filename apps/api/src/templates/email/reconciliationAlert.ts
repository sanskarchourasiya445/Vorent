import type { ReconciliationAlertEmailPayload } from "@warrant/contracts";
import { escapeHtml, formatCurrency } from "./utils.js";

export function renderReconciliationAlertEmail(payload: ReconciliationAlertEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[Warrant Studio ALERT] Reconciliation Discrepancy: Order ${payload.orderId}`;
  const greeting = payload.recipientName ? `Attention ${escapeHtml(payload.recipientName)},` : "Attention Compliance Officer,";
  const formattedExpected = formatCurrency(payload.expectedAmount, payload.currency);
  const formattedActual = formatCurrency(payload.actualAmount, payload.currency);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #fed7aa; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="background-color: #c2410c; padding: 20px 24px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.025em;">Warrant Studio Alert</h1>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #ffedd5;">Reconciliation Discrepancy Detected</p>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 15px; line-height: 1.5;">${greeting}</p>
      <p style="font-size: 15px; line-height: 1.5; color: #9a3412; font-weight: 500;">
        A discrepancy has been flagged during automatic ledger reconciliation between Warrant Studio records and external payment gateway state.
      </p>
      
      <div style="background-color: #fff7ed; border: 1px solid #ffedd5; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #9a3412; font-weight: 500;">Order ID:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace; font-weight: 600; color: #7c2d12;">${escapeHtml(payload.orderId)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #9a3412; font-weight: 500;">Discrepancy Type:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #c2410c;">${escapeHtml(payload.discrepancyType)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #9a3412; font-weight: 500;">Expected Amount:</td>
            <td style="padding: 6px 0; text-align: right; color: #1e293b;">${escapeHtml(formattedExpected)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #9a3412; font-weight: 500;">Actual Amount:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #dc2626;">${escapeHtml(formattedActual)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #9a3412; font-weight: 500;">Detected At:</td>
            <td style="padding: 6px 0; text-align: right; color: #1e293b;">${new Date(payload.detectedAt).toUTCString()}</td>
          </tr>
        </table>
      </div>

      <h4 style="margin: 16px 0 8px 0; font-size: 13px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Diagnostic Reason</h4>
      <div style="background-color: #f1f5f9; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 13px; color: #334155; line-height: 1.4; word-break: break-all;">
        ${escapeHtml(payload.reason)}
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-top: 20px; margin-bottom: 0;">
        Action is recommended: Please review the audit trail and payment order record in the Warrant Studio administration console.
      </p>
    </div>
    <div style="border-top: 1px solid #fed7aa; background: #fff7ed; padding: 12px 24px; font-size: 12px; color: #9a3412; text-align: center;">
      Automated compliance alert &bull; Warrant Studio Security &bull; Powered by Neon PostgreSQL & Resend
    </div>
  </div>
</body>
</html>`;

  const text = `Warrant Studio - Reconciliation Discrepancy Alert

${payload.recipientName ? `Attention ${payload.recipientName},` : "Attention Compliance Officer,"}

A discrepancy has been flagged during automatic ledger reconciliation.

Incident Details:
- Order Reference: ${payload.orderId}
- Discrepancy Type: ${payload.discrepancyType}
- Expected Amount: ${formattedExpected}
- Actual Amount: ${formattedActual}
- Detected At: ${new Date(payload.detectedAt).toUTCString()}

Diagnostic Reason:
${payload.reason}

Please review the audit trail in the Warrant Studio console.

--
Warrant Studio Governance System`;

  return { subject, html, text };
}
