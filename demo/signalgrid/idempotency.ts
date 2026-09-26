/**
 * SignalGrid fixture — deterministic in-memory ownership store.
 *
 * This demonstrates the application-level shape of an atomic claim:
 * one worker claims an event/recipient delivery before transport begins.
 *
 * Production systems must enforce the same claim with a durable atomic
 * operation, such as a database unique constraint or transactional write.
 */

import type { DeliveryRecord } from "./types";

const store = new Map<string, DeliveryRecord>();

export type DeliveryClaim =
  | { kind: "claimed"; record: DeliveryRecord }
  | { kind: "existing"; record: DeliveryRecord };

export function buildIdempotencyKey(eventId: string, recipientId: string): string {
  return `${eventId}::${recipientId}`;
}

function createPendingRecord(
  eventId: string,
  recipientId: string,
  idempotencyKey: string
): DeliveryRecord {
  return {
    deliveryId: `dlv_${eventId}_${recipientId}_${Date.now()}`,
    eventId,
    recipientId,
    attempts: [],
    finalStatus: "pending",
    idempotencyKey,
  };
}

/**
 * Atomically reserves delivery ownership in this fixture.
 *
 * A completed or in-progress operation is returned to later callers.
 * A failed operation may be claimed again for a later recovery attempt.
 */
export function claimDelivery(
  eventId: string,
  recipientId: string
): DeliveryClaim {
  const idempotencyKey = buildIdempotencyKey(eventId, recipientId);
  const existing = store.get(idempotencyKey);

  if (
    existing &&
    (existing.finalStatus === "pending" || existing.finalStatus === "delivered")
  ) {
    return { kind: "existing", record: existing };
  }

  const record = createPendingRecord(eventId, recipientId, idempotencyKey);
  store.set(idempotencyKey, record);

  return { kind: "claimed", record };
}

export function getDeliveryRecord(
  eventId: string,
  recipientId: string
): DeliveryRecord | undefined {
  return store.get(buildIdempotencyKey(eventId, recipientId));
}

export function saveDeliveryRecord(record: DeliveryRecord): void {
  const current = store.get(record.idempotencyKey);

  // A later failure must never overwrite a completed delivery.
  if (current?.finalStatus === "delivered" && record.finalStatus !== "delivered") {
    return;
  }

  store.set(record.idempotencyKey, record);
}

export function completeDelivery(record: DeliveryRecord): DeliveryRecord {
  saveDeliveryRecord(record);
  return getDeliveryRecord(record.eventId, record.recipientId) ?? record;
}

export function resetStore(): void {
  store.clear();
}

export { store as _storeForTesting };