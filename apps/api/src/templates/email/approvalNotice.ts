import type { ApprovalGrantedEmailPayload, ApprovalRevokedEmailPayload } from "@warrant/contracts";
import { escapeHtml, formatCurrency } from "./utils.js";

export function renderApprovalGrantedEmail(payload: ApprovalGrantedEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[Warrant Studio] Spend Approval Granted: ${payload.approvalId}`;
  const greeting = payload.recipientName ? `Hello ${escapeHtml(payload.recipientName)},` : "Hello,";
  const formattedCap = formatCurrency(payload.spendCap, payload.currency);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="background-color: #064e3b; padding: 20px 24px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.025em;">Warrant Studio</h1>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #a7f3d0;">Governance & Spending Controls</p>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 15px; line-height: 1.5;">${greeting}</p>
      <p style="font-size: 15px; line-height: 1.5;">A new spending approval has been granted under your organization's policy governance mandate.</p>
      
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #166534; font-weight: 500;">Approval ID:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace; font-weight: 600; color: #064e3b;">${escapeHtml(payload.approvalId)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #166534; font-weight: 500;">Spend Cap:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #064e3b; font-size: 16px;">${escapeHtml(formattedCap)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #166534; font-weight: 500;">Policy ID:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace; color: #1e293b;">${escapeHtml(payload.policyId)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #166534; font-weight: 500;">Policy Hash:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace; font-size: 12px; color: #64748b;">${escapeHtml(payload.policyHash.slice(0, 16))}...</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #166534; font-weight: 500;">Granted By:</td>
            <td style="padding: 6px 0; text-align: right; color: #1e293b;">${escapeHtml(payload.grantedBy)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #166534; font-weight: 500;">Expires At:</td>
            <td style="padding: 6px 0; text-align: right; color: #1e293b;">${new Date(payload.expiresAt).toUTCString()}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 0;">
        This spend approval is bound cryptographically to the exact policy hash shown above. Any checkout attempting to exceed the spend cap or deviate from the policy will fail automatically.
      </p>
    </div>
    <div style="border-top: 1px solid #e2e8f0; background: #f8fafc; padding: 12px 24px; font-size: 12px; color: #94a3b8; text-align: center;">
      Automated governance notification &bull; Warrant Studio Security &bull; Powered by Neon PostgreSQL & Resend
    </div>
  </div>
</body>
</html>`;

  const text = `Warrant Studio - Spending Approval Granted

${payload.recipientName ? `Hello ${payload.recipientName},` : "Hello,"}

A new spending approval has been granted under your organization's policy governance mandate.

Approval Details:
- Approval ID: ${payload.approvalId}
- Spend Cap: ${formattedCap}
- Policy ID: ${payload.policyId}
- Policy Hash: ${payload.policyHash}
- Granted By: ${payload.grantedBy}
- Expires At: ${new Date(payload.expiresAt).toUTCString()}

This spend approval is cryptographically bound to the exact policy hash. Any checkout exceeding limits will fail automatically.

--
Warrant Studio Governance System`;

  return { subject, html, text };
}

export function renderApprovalRevokedEmail(payload: ApprovalRevokedEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[Warrant Studio] Spend Approval Revoked: ${payload.approvalId}`;
  const greeting = payload.recipientName ? `Hello ${escapeHtml(payload.recipientName)},` : "Hello,";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="background-color: #991b1b; padding: 20px 24px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.025em;">Warrant Studio</h1>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #fecaca;">Spending Control Revocation Notice</p>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 15px; line-height: 1.5;">${greeting}</p>
      <p style="font-size: 15px; line-height: 1.5;">A previously issued spending approval has been explicitly <strong>revoked</strong> by an administrator or compliance officer.</p>
      
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #991b1b; font-weight: 500;">Approval ID:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace; font-weight: 600; color: #7f1d1d;">${escapeHtml(payload.approvalId)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #991b1b; font-weight: 500;">Policy ID:</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace; color: #1e293b;">${escapeHtml(payload.policyId)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #991b1b; font-weight: 500;">Revoked Reason:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #b91c1c;">${escapeHtml(payload.revokedReason)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #991b1b; font-weight: 500;">Revoked By:</td>
            <td style="padding: 6px 0; text-align: right; color: #1e293b;">${escapeHtml(payload.revokedBy)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #991b1b; font-weight: 500;">Revoked At:</td>
            <td style="padding: 6px 0; text-align: right; color: #1e293b;">${new Date(payload.revokedAt).toUTCString()}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 0;">
        Any active checkout sessions or pending proposals associated with this approval are now null and void. Any capture attempt will fail closed.
      </p>
    </div>
    <div style="border-top: 1px solid #e2e8f0; background: #f8fafc; padding: 12px 24px; font-size: 12px; color: #94a3b8; text-align: center;">
      Automated governance notification &bull; Warrant Studio Security &bull; Powered by Neon PostgreSQL & Resend
    </div>
  </div>
</body>
</html>`;

  const text = `Warrant Studio - Spending Approval Revoked

${payload.recipientName ? `Hello ${payload.recipientName},` : "Hello,"}

A previously issued spending approval has been explicitly REVOKED.

Revocation Details:
- Approval ID: ${payload.approvalId}
- Policy ID: ${payload.policyId}
- Revocation Reason: ${payload.revokedReason}
- Revoked By: ${payload.revokedBy}
- Revoked At: ${new Date(payload.revokedAt).toUTCString()}

Any pending checkouts or proposals associated with this approval are now void.

--
Warrant Studio Governance System`;

  return { subject, html, text };
}
