/**
 * SignalGrid – core domain types
 * Fictional emergency-alert service used as the Memento demo fixture.
 */

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export interface AlertEvent {
  eventId: string;
  title: string;
  body: string;
  severity: AlertSeverity;
  createdAt: string; // ISO-8601
}

export interface Recipient {
  recipientId: string;
  name: string;
  channels: ("sms" | "email" | "push")[];
}

export interface DeliveryAttempt {
  attemptNumber: number;
  channel: "sms" | "email" | "push";
  timestamp: string;
  outcome: "delivered" | "network_timeout" | "permanent_failure";
  durationMs: number;
}

export interface DeliveryRecord {
  deliveryId: string;
  eventId: string;
  recipientId: string;
  attempts: DeliveryAttempt[];
  finalStatus: "delivered" | "failed" | "pending";
  idempotencyKey: string; // eventId + recipientId — enforces one-alert-per-recipient-per-event
}

export interface RetryConfig {
  maxRetries: number;        // previously 2, now 5 after change request
  backoffBaseMs: number;
  retryOnErrors: string[];
}
