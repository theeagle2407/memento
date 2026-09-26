/**
 * SignalGrid fixture — retry engine.
 *
 * This is fictional demo code. It models the important safety rule:
 * a delivery operation must be claimed before any channel send begins.
 */

import type { DeliveryAttempt, DeliveryRecord, RetryConfig } from "./types";
import {
  claimDelivery,
  completeDelivery,
  getDeliveryRecord,
} from "./idempotency";

export const RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  backoffBaseMs: 500,
  retryOnErrors: ["network_timeout"],
};

let transportAttemptCount = 0;

async function simulateSend(
  channel: "sms" | "email" | "push",
  attemptNumber: number
): Promise<Pick<DeliveryAttempt, "outcome" | "durationMs">> {
  transportAttemptCount += 1;

  // Yield to the event loop so a second concurrent caller can observe the
  // pending claim that was written before this transport call began.
  await Promise.resolve();

  // Deterministic demo behaviour: SMS succeeds on attempt three.
  if (channel === "sms" && attemptNumber <= 2) {
    return {
      outcome: "network_timeout",
      durationMs: 3000 + attemptNumber * 100,
    };
  }

  return { outcome: "delivered", durationMs: 160 };
}

export async function attemptDelivery(
  eventId: string,
  recipientId: string,
  channel: "sms" | "email" | "push",
  config: RetryConfig = RETRY_CONFIG
): Promise<DeliveryRecord> {
  const claim = claimDelivery(eventId, recipientId);

  // Another worker already owns or completed this delivery.
  if (claim.kind === "existing") {
    return claim.record;
  }

  const operation = claim.record;
  const attempts: DeliveryAttempt[] = [];
  let finalStatus: DeliveryRecord["finalStatus"] = "failed";

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt += 1) {
    const latest = getDeliveryRecord(eventId, recipientId);

    // Never continue if this operation no longer owns the record.
    if (latest?.deliveryId !== operation.deliveryId) {
      return latest ?? operation;
    }

    const { outcome, durationMs } = await simulateSend(channel, attempt);

    attempts.push({
      attemptNumber: attempt,
      channel,
      timestamp: `demo-attempt-${attempt}`,
      outcome,
      durationMs,
    });

    if (outcome === "delivered") {
      finalStatus = "delivered";
      break;
    }

    if (!config.retryOnErrors.includes(outcome)) {
      break;
    }
  }

  return completeDelivery({
    ...operation,
    attempts,
    finalStatus,
  });
}

export function getTransportAttemptCountForTesting(): number {
  return transportAttemptCount;
}

export function resetTransportForTesting(): void {
  transportAttemptCount = 0;
}