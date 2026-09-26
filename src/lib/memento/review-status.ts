import { evidenceStatus, type TestEvidence } from "./evidence";
export function importedStatus(evidence?: TestEvidence, hash?: string | null) {
  if (!evidence) return {label:"No evidence",tone:"neutral"};
  if (hash === null) return {label:"Fingerprint unavailable",tone:"neutral"};
  if (!hash) return {label:"Checking fingerprint…",tone:"neutral"};
  const state = evidenceStatus(evidence, hash);
  return {
    reported_pass:{label:"Imported command passed",tone:"success"},
    reported_fail:{label:"Imported command failed",tone:"danger"},
    outdated:{label:"Different code version",tone:"danger"},
    changed_during_run:{label:"Source changed during run",tone:"danger"},
  }[state];
}
