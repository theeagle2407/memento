/**
 * scripts/verify-signalgrid.ts
 *
 * Dependency-free verification script for the SignalGrid fixture.
 * Proves that the idempotency model and async retry engine behave correctly.
 *
 * Run via: npm run test
 */

import {
  resetStore,
} from "../demo/signalgrid/idempotency";
import {
  attemptDelivery,
  getTransportAttemptCountForTesting,
  resetTransportForTesting,
} from "../demo/signalgrid/retry";
import { summariseRouting } from "../demo/signalgrid/router";
import type { DeliveryRecord } from "../demo/signalgrid/types";

// ─── Minimal test harness ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(description: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓  ${description}`);
    passed += 1;
  } else {
    console.error(`  ✗  ${description}`);
    failed += 1;
    failures.push(description);
  }
}

function suite(name: string, fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    console.log(`\n── ${name}`);
    await fn();
  };
}

// ─── Test suites ─────────────────────────────────────────────────────────────

const testSingleDelivery = suite(
  "Single SMS delivery — 2 timeouts then delivered on attempt 3",
  async () => {
    resetStore();
    resetTransportForTesting();

    const record = await attemptDelivery("evt_single", "r_A", "sms");

    assert("finalStatus is delivered", record.finalStatus === "delivered");
    assert(
      "exactly 3 transport attempts",
      getTransportAttemptCountForTesting() === 3
    );
    assert(
      "attempt 1 outcome is network_timeout",
      record.attempts[0]?.outcome === "network_timeout"
    );
    assert(
      "attempt 2 outcome is network_timeout",
      record.attempts[1]?.outcome === "network_timeout"
    );
    assert(
      "attempt 3 outcome is delivered",
      record.attempts[2]?.outcome === "delivered"
    );
  }
);

const testConcurrentDelivery = suite(
  "Concurrent delivery — second caller observes pending claim, no duplicate transport",
  async () => {
    resetStore();
    resetTransportForTesting();

    // Launch both calls simultaneously. Because simulateSend() is now async and
    // yields via await Promise.resolve(), the first caller writes a pending claim
    // to the store synchronously, then yields. The second caller enters
    // claimDelivery(), finds the pending record, and returns immediately without
    // any transport calls.
    const [first, second] = await Promise.all([
      attemptDelivery("evt_concurrent", "r_B", "sms"),
      attemptDelivery("evt_concurrent", "r_B", "sms"),
    ]);

    // (a) first call completes as delivered
    assert(
      "(a) first result finalStatus is delivered",
      first.finalStatus === "delivered"
    );

    // (b) second concurrent call observes the pending delivery — it returns
    //     the existing pending/delivered record rather than performing transport
    assert(
      "(b) second result did not perform transport (zero attempts on its returned record OR same record as first)",
      second.attempts.length === 0 ||
        second.deliveryId === first.deliveryId
    );

    // (c) the persisted final record is delivered
    const { getDeliveryRecord } = await import("../demo/signalgrid/idempotency");
    const persisted = getDeliveryRecord("evt_concurrent", "r_B");
    assert(
      "(c) persisted record finalStatus is delivered",
      persisted?.finalStatus === "delivered"
    );

    // (d) exactly 3 transport attempts (not 6, not 0)
    const count = getTransportAttemptCountForTesting();
    assert(
      `(d) exactly 3 transport attempts (got ${count})`,
      count === 3
    );

    // (e) a later repeat call makes no further transport attempts
    const countBefore = getTransportAttemptCountForTesting();
    await attemptDelivery("evt_concurrent", "r_B", "sms");
    const countAfter = getTransportAttemptCountForTesting();
    assert(
      "(e) repeat call makes zero further transport attempts",
      countAfter === countBefore
    );
  }
);

const testNonSmsDelivery = suite(
  "Non-SMS channel (email) — delivered on first attempt",
  async () => {
    resetStore();
    resetTransportForTesting();

    const record = await attemptDelivery("evt_email", "r_C", "email");

    assert("finalStatus is delivered", record.finalStatus === "delivered");
    assert(
      "exactly 1 transport attempt",
      getTransportAttemptCountForTesting() === 1
    );
    assert(
      "single attempt outcome is delivered",
      record.attempts[0]?.outcome === "delivered"
    );
  }
);

const testDeliveredRecordImmutable = suite(
  "Delivered record cannot be overwritten by a failure",
  async () => {
    resetStore();
    resetTransportForTesting();

    // First call — should deliver on attempt 3
    await attemptDelivery("evt_immutable", "r_D", "sms");

    const { saveDeliveryRecord, getDeliveryRecord } = await import(
      "../demo/signalgrid/idempotency"
    );
    const delivered = getDeliveryRecord("evt_immutable", "r_D")!;

    // Attempt to overwrite with a failure record
    saveDeliveryRecord({
      ...delivered,
      finalStatus: "failed",
      attempts: [],
    });

    const after = getDeliveryRecord("evt_immutable", "r_D")!;
    assert(
      "delivered record finalStatus unchanged after failed overwrite attempt",
      after.finalStatus === "delivered"
    );
  }
);

// ─── summariseRouting: runtime regression evidence ────────────────────────────
//
// The original implementation computed:
//
//   failed: records.length - delivered
//
// That formula treats every non-delivered record as failed.
// For a pending-only input of length N it returns failed = N, not 0.
// The bug is a silent runtime miscount: the TypeScript compiler
// accepted it because the return type only declared `failed: number`.
//
// The suite below runs the original formula in isolation, then
// runs the corrected implementation, so both results are visible.

/** Verbatim copy of the original (buggy) summariseRouting logic. */
function summariseRoutingOriginal(records: DeliveryRecord[]): {
  total: number;
  delivered: number;
  failed: number;
  totalAttempts: number;
} {
  const delivered = records.filter((r) => r.finalStatus === "delivered").length;
  const totalAttempts = records.reduce((sum, r) => sum + r.attempts.length, 0);
  return {
    total: records.length,
    delivered,
    failed: records.length - delivered,   // ← original line
    totalAttempts,
  };
}

const testSummariseRoutingOriginalBug = suite(
  "summariseRouting — runtime evidence: original formula miscounts pending as failed",
  async () => {
    // One pending record. No delivery was attempted, no transport error occurred.
    const records: DeliveryRecord[] = [
      makeRecord("pending", 0, "bug1"),
    ];

    // ── Original implementation ──────────────────────────────────────────────
    const original = summariseRoutingOriginal(records);
    const originalFailedIsWrong = original.failed !== 0;

    console.log(
      `     original  failed=${original.failed}  (expected 0 — bug returns ${original.failed})`
    );
    assert(
      `original implementation: failed equals ${records.length} for pending-only input (demonstrates the miscount)`,
      original.failed === records.length   // passes only when the bug IS present
    );

    // ── Fixed implementation ─────────────────────────────────────────────────
    const fixed = summariseRouting(records);

    console.log(
      `     fixed     failed=${fixed.failed}  (expected 0 — correct)`
    );
    assert(
      "fixed implementation: failed equals 0 for pending-only input",
      fixed.failed === 0
    );
    void originalFailedIsWrong; // suppress unused-variable warning
  }
);

// ─── summariseRouting regression suites ──────────────────────────────────────

/** Minimal helper to build a bare DeliveryRecord for summariseRouting tests. */
function makeRecord(
  finalStatus: DeliveryRecord["finalStatus"],
  attemptCount: number,
  suffix: string
): DeliveryRecord {
  return {
    deliveryId: `dlv_test_${suffix}`,
    eventId: `evt_test_${suffix}`,
    recipientId: `r_test_${suffix}`,
    attempts: Array.from({ length: attemptCount }, (_, i) => ({
      attemptNumber: i + 1,
      channel: "sms" as const,
      timestamp: `demo-attempt-${i + 1}`,
      outcome: i < attemptCount - 1 ? ("network_timeout" as const) : ("delivered" as const),
      durationMs: 100,
    })),
    finalStatus,
    idempotencyKey: `evt_test_${suffix}::r_test_${suffix}`,
  };
}

const testSummariseRoutingMixed = suite(
  "summariseRouting — mixed delivered/failed/pending list",
  async () => {
    const records: DeliveryRecord[] = [
      makeRecord("delivered", 3, "d1"),
      makeRecord("delivered", 1, "d2"),
      makeRecord("failed",    2, "f1"),
      makeRecord("pending",   0, "p1"),
      makeRecord("pending",   0, "p2"),
    ];

    const s = summariseRouting(records);

    assert("total equals record count (5)",       s.total === 5);
    assert("delivered count is 2",                s.delivered === 2);
    assert("failed count is 1",                   s.failed === 1);
    assert("pending count is 2",                  s.pending === 2);
    assert("total equals delivered+failed+pending",
      s.total === s.delivered + s.failed + s.pending);
  }
);

const testSummariseRoutingPendingOnly = suite(
  "summariseRouting — pending-only input must report zero failures",
  async () => {
    const records: DeliveryRecord[] = [
      makeRecord("pending", 0, "po1"),
      makeRecord("pending", 0, "po2"),
      makeRecord("pending", 0, "po3"),
    ];

    const s = summariseRouting(records);

    assert("total is 3",    s.total === 3);
    assert("delivered is 0", s.delivered === 0);
    assert("failed is 0",   s.failed === 0);
    assert("pending is 3",  s.pending === 3);
  }
);

const testSummariseRoutingEmpty = suite(
  "summariseRouting — empty input returns zero for every count",
  async () => {
    const s = summariseRouting([]);

    assert("total is 0",        s.total === 0);
    assert("delivered is 0",    s.delivered === 0);
    assert("failed is 0",       s.failed === 0);
    assert("pending is 0",      s.pending === 0);
    assert("totalAttempts is 0", s.totalAttempts === 0);
  }
);

const testSummariseRoutingTotalAttempts = suite(
  "summariseRouting — totalAttempts is sum across all records",
  async () => {
    const records: DeliveryRecord[] = [
      makeRecord("delivered", 3, "ta1"),  // 3 attempts
      makeRecord("failed",    2, "ta2"),  // 2 attempts
      makeRecord("pending",   0, "ta3"),  // 0 attempts
    ];

    const s = summariseRouting(records);

    assert("totalAttempts is 5 (3+2+0)", s.totalAttempts === 5);
    assert("total is 3",                 s.total === 3);
  }
);

// ─── Runner ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("SignalGrid fixture verification\n");

  await testSingleDelivery();
  await testConcurrentDelivery();
  await testNonSmsDelivery();
  await testDeliveredRecordImmutable();
  await testSummariseRoutingOriginalBug();
  await testSummariseRoutingMixed();
  await testSummariseRoutingPendingOnly();
  await testSummariseRoutingEmpty();
  await testSummariseRoutingTotalAttempts();

  console.log(`\n${"─".repeat(48)}`);
  if (failed === 0) {
    console.log(
      `PASS  ${passed} assertions passed, ${failed} failed\n`
    );
  } else {
    console.error(
      `FAIL  ${passed} passed, ${failed} failed`
    );
    console.error("\nFailed assertions:");
    failures.forEach((f) => console.error(`  • ${f}`));
    console.error("");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
