import type { OrderCapturedEmailPayload } from "@warrant/contracts";
import { escapeHtml, formatCurrency } from "./utils.js";

export function renderOrderConfirmationEmail(payload: OrderCapturedEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[Warrant Studio] Payment Captured: Order ${payload.orderId}`;
  const greeting = payload.recipientName ? `Hello ${escapeHtml(payload.recipientName)},` : "Hello,";
  const formattedTotal = formatCurrency(payload.amount, payload.currency);

  const itemRowsHtml =
    payload.items.length > 0
      ? payload.items
          .map(
            (item) => `
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #1e293b;">${escapeHtml(item.name)}</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; text-align: center; color: #64748b;">${item.quantity}</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; text-align: right; color: #1e293b;">${escapeHtml(
              formatCurrency(item.unitPrice, payload.currency),
            )}</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 500; color: #0f172a;">${escapeHtml(
              formatCurrency(item.unitPrice * item.quantity, payload.currency),
            )}</td>
          </tr>`,
          )
          .join("")
      : `<tr><td colspan="4" style="padding: 12px 0; text-align: center; color: #64748b;">Authorized Cart Items</td></tr>`;

  const itemRowsText =
    payload.items.length > 0
      ? payload.items
          .map(
            (i) =>
              `- ${i.name} x${i.quantity} @ ${formatCurrency(i.unitPrice, payload.currency)} = ${formatCurrency(
                i.unitPrice * i.quantity,
                payload.currency,
              )}`,
          )
          .join("\n")
      : "Authorized Cart Items";

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
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #a7f3d0;">Official Payment Confirmation & Evidence Record</p>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 15px; line-height: 1.5;">${greeting}</p>
      <p style="font-size: 15px; line-height: 1.5;">Your payment has been successfully authorized and captured through PayPal Sandbox under active governance verification.</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Order Reference:</td>
            <td style="padding: 4px 0; text-align: right; font-family: monospace; font-weight: 600; color: #0f172a;">${escapeHtml(payload.orderId)}</td>
          </tr>
          ${
            payload.paypalOrderId
              ? `<tr>
            <td style="padding: 4px 0; color: #64748b;">PayPal Order ID:</td>
            <td style="padding: 4px 0; text-align: right; font-family: monospace; color: #0284c7;">${escapeHtml(payload.paypalOrderId)}</td>
          </tr>`
              : ""
          }
          ${
            payload.captureId
              ? `<tr>
            <td style="padding: 4px 0; color: #64748b;">PayPal Capture ID:</td>
            <td style="padding: 4px 0; text-align: right; font-family: monospace; color: #0284c7;">${escapeHtml(payload.captureId)}</td>
          </tr>`
              : ""
          }
          ${
            payload.approvalId
              ? `<tr>
            <td style="padding: 4px 0; color: #64748b;">Approval Binding:</td>
            <td style="padding: 4px 0; text-align: right; font-family: monospace; color: #064e3b; font-weight: 500;">${escapeHtml(payload.approvalId)}</td>
          </tr>`
              : ""
          }
          ${
            payload.policyHash
              ? `<tr>
            <td style="padding: 4px 0; color: #64748b;">Policy Hash:</td>
            <td style="padding: 4px 0; text-align: right; font-family: monospace; font-size: 12px; color: #64748b;">${escapeHtml(payload.policyHash.slice(0, 16))}...</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Captured At:</td>
            <td style="padding: 4px 0; text-align: right; color: #1e293b;">${new Date(payload.capturedAt).toUTCString()}</td>
          </tr>
        </table>
      </div>

      <h3 style="font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-top: 24px; margin-bottom: 8px;">Order Items</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 12px; text-transform: uppercase;">
            <th style="padding: 6px 0; text-align: left;">Item</th>
            <th style="padding: 6px 0; text-align: center;">Qty</th>
            <th style="padding: 6px 0; text-align: right;">Unit Price</th>
            <th style="padding: 6px 0; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding: 12px 0 4px; text-align: right; font-weight: 600; color: #1e293b; font-size: 15px;">Total Captured:</td>
            <td style="padding: 12px 0 4px; text-align: right; font-weight: 700; color: #064e3b; font-size: 18px;">${escapeHtml(formattedTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 0;">
        This transaction has been cryptographically validated and logged to the immutable Warrant Studio ledger in Neon PostgreSQL.
      </p>
    </div>
    <div style="border-top: 1px solid #e2e8f0; background: #f8fafc; padding: 12px 24px; font-size: 12px; color: #94a3b8; text-align: center;">
      Automated payment receipt &bull; Warrant Studio Security &bull; Powered by Neon PostgreSQL & Resend
    </div>
  </div>
</body>
</html>`;

  const text = `Warrant Studio - Payment Captured Confirmation

${payload.recipientName ? `Hello ${payload.recipientName},` : "Hello,"}

Your payment has been successfully authorized and captured.

Transaction Summary:
- Order Reference: ${payload.orderId}
${payload.paypalOrderId ? `- PayPal Order ID: ${payload.paypalOrderId}\n` : ""}${payload.captureId ? `- PayPal Capture ID: ${payload.captureId}\n` : ""}${payload.approvalId ? `- Approval ID: ${payload.approvalId}\n` : ""}${payload.policyHash ? `- Policy Hash: ${payload.policyHash}\n` : ""}- Captured At: ${new Date(payload.capturedAt).toUTCString()}
- Total Amount: ${formattedTotal}

Items:
${itemRowsText}

This transaction has been verified against policy invariants and logged to the Warrant Studio immutable ledger.

--
Warrant Studio Governance System`;

  return { subject, html, text };
}
