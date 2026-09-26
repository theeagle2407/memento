/** Bounded, fictional single-process laboratory. No external delivery occurs. */
export type Revision = "baseline" | "candidate" | "repaired";
export const REVISIONS = {
  baseline: { label: "Original", maxRetries: 2, preserveClaim: true },
  candidate: { label: "Proposed change", maxRetries: 5, preserveClaim: false },
  repaired: { label: "Corrected change", maxRetries: 5, preserveClaim: true },
} as const;
export const SOURCE_PATH = "src/lib/memento/verification.ts";
export interface TraceEvent { sequence: number; worker: string; event: string; attempt?: number }
export interface Check { label: string; pass: boolean; detail: string }
export interface LabResult {
  revision: Revision; passed: boolean; checks: Check[]; trace: TraceEvent[];
  attempts: number; operations: number; completed: number;
}
export interface Verification {
  runId: string; createdAt: string; durationMs: number;
  baseline: LabResult; candidate: LabResult;
}
export function isRevision(value: unknown): value is Revision {
  return value === "baseline" || value === "candidate" || value === "repaired";
}
export function revisionSource(revision: Revision): string {
  const config = REVISIONS[revision];
  return [
    `// ${SOURCE_PATH}`, "// Configuration executed by the local verification lab.",
    `export const ${revision} = {`, `  maxRetries: ${config.maxRetries},`,
    `  preserveClaim: ${config.preserveClaim},`, "};", "",
    "// If preserveClaim is true, reserve the event/recipient",
    "// before transport; followers observe the existing claim.",
    "// If false, each caller starts its own delivery operation.",
  ].join("\n");
}
export async function runLab(revision: Revision): Promise<LabResult> {
  const config = REVISIONS[revision];
  // Each invocation owns all mutable state. Concurrent HTTP runs cannot reset it.
  const store = new Map<string, { status: "pending" | "delivered" | "failed" }>();
  const trace: TraceEvent[] = [];
  let attempts = 0, operations = 0, completed = 0;
  const record = (worker: string, event: string, attempt?: number) =>
    trace.push({ sequence: trace.length + 1, worker, event, attempt });
  async function deliver(worker: string) {
    const key = JSON.stringify(["sample-event", "sample-recipient"]);
    if (config.preserveClaim && store.has(key)) {
      record(worker, "Existing claim observed; no transport");
      return;
    }
    operations++;
    const operation: { status: "pending" | "delivered" | "failed" } = { status: "pending" };
    if (config.preserveClaim) store.set(key, operation);
    record(worker, config.preserveClaim ? "Delivery claim reserved" : "Operation started without claim");
    // Three simulated failures, then success: unlike the original demo,
    // this exercises the difference between two and five retries.
    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
      attempts++;
      await Promise.resolve();
      if (attempt <= 3) record(worker, "Simulated timeout (no external send)", attempt);
      else {
        operation.status = "delivered"; completed++;
        record(worker, "Simulated operation completed", attempt);
        return;
      }
    }
    operation.status = "failed";
    record(worker, "Retry budget exhausted");
  }
  await Promise.all([deliver("Worker A"), deliver("Worker B")]);
  const concurrentOperations = operations, concurrentCompleted = completed, concurrentAttempts = attempts;
  const beforeRepeat = attempts;
  // Only assert completed replay semantics when a completion actually occurred.
  if (completed > 0) await deliver("Repeat caller");
  const checks: Check[] = [
    { label: "Recovers after three timeouts", pass: concurrentCompleted >= 1,
      detail: `${concurrentCompleted} simulated completion(s) after ${concurrentAttempts} transport attempt(s).` },
    { label: "Only one concurrent operation starts", pass: concurrentOperations === 1,
      detail: `${concurrentOperations} operation(s) started for the same event and recipient.` },
    { label: "Only one simulated completion occurs", pass: concurrentCompleted === 1,
      detail: `${concurrentCompleted} completion(s) in the concurrent run.` },
    { label: "Completed replay sends nothing further", pass: concurrentCompleted > 0 && attempts === beforeRepeat,
      detail: concurrentCompleted > 0 ? `${attempts - beforeRepeat} additional transport attempt(s).` : "Not satisfied: no completed operation to replay." },
  ];
  return { revision, passed: checks.every(check => check.pass), checks, trace,
    attempts: concurrentAttempts, operations: concurrentOperations, completed: concurrentCompleted };
}
export async function verifyRevision(revision: Revision): Promise<Verification> {
  const started = performance.now();
  const [baseline, candidate] = await Promise.all([runLab("baseline"), runLab(revision)]);
  return { runId: crypto.randomUUID(), createdAt: new Date().toISOString(),
    durationMs: Math.round((performance.now() - started) * 100) / 100, baseline, candidate };
}
