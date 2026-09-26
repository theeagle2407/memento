# SignalGrid — System Documentation

> **SignalGrid is a fictional local sample project.**
> It exists solely as a demonstration fixture for Memento, a maintenance-rehearsal
> tool. It has no production users, no real infrastructure, and no live data.
> All incidents, metrics, and recipient names in this codebase are invented for
> illustrative purposes.

---

## Purpose

SignalGrid models an emergency-alert delivery service. Its role inside Memento is
to provide a realistic, self-contained codebase on which the maintenance-passport
workflow can be demonstrated. The code must be realistic enough to exercise
genuine ownership questions but simple enough to run entirely in-process with no
external dependencies.

---

## Modules

### `demo/signalgrid/types.ts`

Defines the core domain types:

| Type | Description |
|------|-------------|
| `AlertEvent` | An alert to be delivered (eventId, title, severity, timestamp) |
| `Recipient` | A target with one or more delivery channels (SMS, email, push) |
| `DeliveryAttempt` | A single transport call and its outcome |
| `DeliveryRecord` | The full lifecycle of delivering one event to one recipient |
| `RetryConfig` | Tuneable retry parameters (maxRetries, backoffBaseMs, retryOnErrors) |

### `demo/signalgrid/idempotency.ts`

Implements the **atomic claim model**:

1. Before transport begins, `claimDelivery(eventId, recipientId)` is called.
2. If no record exists, a `pending` record is written atomically and a `"claimed"` result is returned.
3. If a `pending` or `delivered` record already exists, a `"existing"` result is returned — the caller exits without transport.
4. A `delivered` record can never be overwritten by a `failed` record (`saveDeliveryRecord` enforces this).

The idempotency key is `${eventId}::${recipientId}`.

### `demo/signalgrid/retry.ts`

Implements the **retry loop**:

1. Calls `claimDelivery` once before the loop. If another worker already claimed, returns the existing record.
2. Loops up to `maxRetries + 1` times.
3. On each iteration, checks whether the current worker still owns the record (guards against a late race).
4. Calls `simulateSend` (async — yields via `await Promise.resolve()` before returning a deterministic outcome).
5. On `network_timeout`, continues to the next attempt. On any other error, stops.
6. Calls `completeDelivery` with the final record.

**Current retry configuration:**

```
maxRetries: 5   // changed from 2 per CR-2024-089
backoffBaseMs: 500
retryOnErrors: ["network_timeout"]
```

**Deterministic simulation behaviour (demo only):**

- SMS, attempts 1–2: `network_timeout`
- SMS, attempt 3+: `delivered`
- Email / push, attempt 1: `delivered`

### `demo/signalgrid/router.ts`

Routes an `AlertEvent` to a list of `Recipient` values, calling `attemptDelivery`
for each recipient's primary channel. Contains fixture data: 4 recipients, 2 events.

---

## Retry model

```
attemptDelivery(eventId, recipientId, channel)
  │
  ├─ claimDelivery()  ←── atomic: writes pending record or returns existing
  │      │
  │      └─ kind: "existing"  →  return existing record (no transport)
  │
  └─ kind: "claimed"
         │
         └─ for attempt in 1 .. maxRetries+1
                │
                ├─ check ownership still holds
                ├─ await simulateSend()   ←── yields to event loop here
                │      │
                │      ├─ "network_timeout"  →  continue
                │      └─ "delivered"        →  break
                │
                └─ completeDelivery()
```

---

## Idempotency model

The claim is **application-level**: `claimDelivery` performs a synchronous
map read-then-write within a single JavaScript turn. This is safe in a
single-threaded Node.js process because no other code can interleave between
the read and the write.

In a production distributed system, the same guarantee requires a **durable
atomic operation** — for example:

- A database `INSERT … WHERE NOT EXISTS` unique on `(event_id, recipient_id)`
- A Redis `SET NX` (set-if-not-exists)
- A transactional write with an optimistic concurrency check

The in-memory demo does not replicate these mechanisms. It illustrates only
the *shape* of the invariant: claim before transport, and treat pending as
"owned" so that a concurrent caller does not attempt a duplicate send.

---

## Limits of the in-memory demo

| Aspect | Demo behaviour | Production requirement |
|--------|---------------|----------------------|
| Persistence | In-memory `Map` (lost on restart) | Durable database |
| Concurrency | Single Node.js process, single thread | Distributed workers |
| Claim atomicity | Synchronous map write | Database unique constraint or `SET NX` |
| Backoff | Commented out (runs instantly) | Real exponential backoff with jitter |
| Transport | Deterministic `simulateSend()` stub | Real SMS / email / push provider APIs |
| Recipients | 4 static fixture records | Dynamic subscriber database |
| Events | 2 static fixture records | Real-time event stream |

---

## Safety invariant

> **One delivery operation per event and recipient.**

This is the invariant that must never be violated when the retry limit is
changed. Increasing `maxRetries` is safe only because `claimDelivery` ensures
no second transport operation can start for a (eventId, recipientId) pair that
is already pending or delivered.

Removing or bypassing `claimDelivery` before transport would allow duplicate
alert sends whenever retries overlap with concurrent workers. In an emergency-
alert context, a recipient receiving the same evacuation order five times could
undermine trust in the system at the worst possible moment.

---

*This document describes a fictional demo codebase. No real users, customers,
incidents, or infrastructure are involved.*
