import { Resend } from "resend";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { db } from "../db/index.js";
import { logAuditEvent } from "../db/repositories/auditRepository.js";
import {
  EmailEventType,
  type AuditEventType,
  type ApprovalGrantedEmailPayload,
  type ApprovalRevokedEmailPayload,
  type OrderCapturedEmailPayload,
  type ReconciliationAlertEmailPayload,
  type SendEmailResult,
} from "@warrant/contracts";
import {
  renderApprovalGrantedEmail,
  renderApprovalRevokedEmail,
  renderOrderConfirmationEmail,
  renderReconciliationAlertEmail,
} from "../templates/email/index.js";

/**
 * Checks whether the configured RESEND_API_KEY is an active live key
 * vs undefined or dummy placeholder.
 */
function isLiveResendKey(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (trimmed === "" || trimmed.includes("placeholder")) return false;
  return trimmed.startsWith("re_");
}

export class EmailService {
  private resend: Resend | null = null;
  private readonly fromAddress: string;

  constructor(apiKey?: string, fromAddress?: string) {
    const key = apiKey ?? env.RESEND_API_KEY;
    this.fromAddress = fromAddress ?? env.EMAIL_FROM ?? "Warrant Studio <notifications@warrant.studio>";

    if (isLiveResendKey(key) && env.NODE_ENV !== "test") {
      this.resend = new Resend(key);
    } else {
      this.resend = null;
    }
  }

  /**
   * Internal sender with mock fallback, strict error containment, and audit logging.
   */
  private async sendInternal(params: {
    eventType: EmailEventType;
    recipientEmail: string;
    subject: string;
    html: string;
    text: string;
    entityId?: string;
    ownerId?: string;
  }): Promise<SendEmailResult> {
    const isMock = this.resend === null;

    try {
      let emailId: string | undefined;

      if (isMock) {
        emailId = `mock_email_${randomUUID().slice(0, 8)}`;
        if (env.NODE_ENV !== "test") {
          console.log(
            `[EmailService:Mock] Event: ${params.eventType} | To: ${params.recipientEmail} | Subject: "${params.subject}" | MockID: ${emailId}`,
          );
        }
      } else {
        const { data, error } = await this.resend!.emails.send({
          from: this.fromAddress,
          to: params.recipientEmail,
          subject: params.subject,
          html: params.html,
          text: params.text,
        });

        if (error) {
          console.error(`[EmailService:Error] Resend API rejected message:`, error);
          await this.recordAuditLog({
            eventType: "EMAIL_NOTIFICATION_FAILED",
            emailEventType: params.eventType,
            recipientEmail: params.recipientEmail,
            error: error.message,
            entityId: params.entityId,
            ownerId: params.ownerId,
          });
          return {
            success: false,
            mock: false,
            error: error.message,
          };
        }

        emailId = data?.id;
      }

      await this.recordAuditLog({
        eventType: "EMAIL_NOTIFICATION_SENT",
        emailEventType: params.eventType,
        recipientEmail: params.recipientEmail,
        messageId: emailId,
        mock: isMock,
        entityId: params.entityId,
        ownerId: params.ownerId,
      });

      return {
        success: true,
        id: emailId,
        mock: isMock,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[EmailService:Exception] Unhandled error during email dispatch:`, errorMessage);

      try {
        await this.recordAuditLog({
          eventType: "EMAIL_NOTIFICATION_FAILED",
          emailEventType: params.eventType,
          recipientEmail: params.recipientEmail,
          error: errorMessage,
          entityId: params.entityId,
          ownerId: params.ownerId,
        });
      } catch {
        // Suppress audit logging failures during catastrophic email errors
      }

      return {
        success: false,
        mock: isMock,
        error: errorMessage,
      };
    }
  }

  private async recordAuditLog(details: {
    eventType: Extract<AuditEventType, "EMAIL_NOTIFICATION_SENT" | "EMAIL_NOTIFICATION_FAILED">;
    emailEventType: EmailEventType;
    recipientEmail: string;
    messageId?: string;
    mock?: boolean;
    error?: string;
    entityId?: string;
    ownerId?: string;
  }): Promise<void> {
    try {
      await logAuditEvent(db, {
        actorType: "SYSTEM",
        eventType: details.eventType,
        entityType: "EMAIL_NOTIFICATION",
        entityId: details.entityId,
        ownerId: details.ownerId,
        payload: {
          emailEventType: details.emailEventType,
          recipient: details.recipientEmail,
          messageId: details.messageId,
          mock: details.mock ?? false,
          error: details.error,
          dispatchedAt: new Date().toISOString(),
        },
      });
    } catch (auditErr) {
      console.warn(`[EmailService:AuditWarn] Failed to record email audit record:`, auditErr);
    }
  }

  /**
   * Send notification when spend approval is granted.
   */
  public async sendApprovalGranted(payload: ApprovalGrantedEmailPayload, ownerId?: string): Promise<SendEmailResult> {
    const rendered = renderApprovalGrantedEmail(payload);
    return this.sendInternal({
      eventType: EmailEventType.APPROVAL_GRANTED,
      recipientEmail: payload.recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      entityId: payload.approvalId,
      ownerId,
    });
  }

  /**
   * Send notification when spend approval is revoked.
   */
  public async sendApprovalRevoked(payload: ApprovalRevokedEmailPayload, ownerId?: string): Promise<SendEmailResult> {
    const rendered = renderApprovalRevokedEmail(payload);
    return this.sendInternal({
      eventType: EmailEventType.APPROVAL_REVOKED,
      recipientEmail: payload.recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      entityId: payload.approvalId,
      ownerId,
    });
  }

  /**
   * Send payment confirmation when an order is captured.
   */
  public async sendOrderCaptured(payload: OrderCapturedEmailPayload, ownerId?: string): Promise<SendEmailResult> {
    const rendered = renderOrderConfirmationEmail(payload);
    return this.sendInternal({
      eventType: EmailEventType.ORDER_CAPTURED,
      recipientEmail: payload.recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      entityId: payload.orderId,
      ownerId,
    });
  }

  /**
   * Send compliance alert when reconciliation detects a discrepancy.
   */
  public async sendReconciliationAlert(
    payload: ReconciliationAlertEmailPayload,
    ownerId?: string,
  ): Promise<SendEmailResult> {
    const rendered = renderReconciliationAlertEmail(payload);
    return this.sendInternal({
      eventType: EmailEventType.RECONCILIATION_ALERT,
      recipientEmail: payload.recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      entityId: payload.orderId,
      ownerId,
    });
  }

  /**
   * Non-blocking fire-and-forget dispatch helpers.
   * Guarantees email dispatch will NEVER interrupt or abort financial workflows.
   */
  public dispatchApprovalGrantedAsync(payload: ApprovalGrantedEmailPayload, ownerId?: string): void {
    this.sendApprovalGranted(payload, ownerId).catch((err) => {
      console.error("[EmailService:AsyncError] Failed async sendApprovalGranted:", err);
    });
  }

  public dispatchApprovalRevokedAsync(payload: ApprovalRevokedEmailPayload, ownerId?: string): void {
    this.sendApprovalRevoked(payload, ownerId).catch((err) => {
      console.error("[EmailService:AsyncError] Failed async sendApprovalRevoked:", err);
    });
  }

  public dispatchOrderCapturedAsync(payload: OrderCapturedEmailPayload, ownerId?: string): void {
    this.sendOrderCaptured(payload, ownerId).catch((err) => {
      console.error("[EmailService:AsyncError] Failed async sendOrderCaptured:", err);
    });
  }

  public dispatchReconciliationAlertAsync(payload: ReconciliationAlertEmailPayload, ownerId?: string): void {
    this.sendReconciliationAlert(payload, ownerId).catch((err) => {
      console.error("[EmailService:AsyncError] Failed async sendReconciliationAlert:", err);
    });
  }
}

export const emailService = new EmailService();
