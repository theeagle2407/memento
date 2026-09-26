import { runLab, verifyRevision } from "../src/lib/memento/verification";
import { diffLines, validReview } from "../src/lib/memento/workspace";
function assert(ok: boolean, label: string) { if (!ok) throw new Error(label); console.log(`PASS ${label}`); }
async function main() {
  const baseline = await runLab("baseline"), bad = await runLab("candidate"), good = await runLab("repaired");
  assert(!baseline.passed && baseline.completed === 0 && baseline.attempts === 3, "Original limit exhausts after three failures");
  assert(!bad.passed && bad.operations === 2 && bad.completed === 2 && bad.attempts === 8, "Unsafe candidate exposes concurrent duplicate operations");
  assert(good.passed && good.operations === 1 && good.completed === 1 && good.attempts === 4, "Corrected candidate recovers and preserves ownership");
  const runs = await Promise.all(Array.from({length:30}, (_,i) => verifyRevision(i % 2 ? "candidate" : "repaired")));
  assert(runs.every((r,i) => r.candidate.passed === !(i%2)) && new Set(runs.map(r=>r.runId)).size === 30, "Thirty overlapping verification runs have isolated state");
  for (const [before,after] of [["a\nb\nc","a\nx\nc"],["","z"],["a\na","a"],["x","x"]]) {
    const diff = diffLines(before,after);
    assert(diff.filter(l=>l.kind!=="add").map(l=>l.text).join("\n") === before && diff.filter(l=>l.kind!=="remove").map(l=>l.text).join("\n") === after, "Diff reconstructs both versions");
  }
  assert(!validReview({id:"incomplete"}), "Malformed saved reviews are rejected");
}
main().catch(err => { console.error(err); process.exitCode = 1; });

import {parseEvidence,evidenceStatus} from "../src/lib/memento/evidence";
const hashA="a".repeat(64),hashB="b".repeat(64);
const evidence=parseEvidence({schema:"memento.test-evidence.v1",file:"src/a.ts",sha256Before:hashA,sha256After:hashA,command:["npm","test"],startedAt:"2026-09-26T00:00:00Z",finishedAt:"2026-09-26T00:01:00Z",exitCode:0,signal:null,output:"PASS",truncated:false});
for(const [label,condition] of [
 ["Matching successful evidence",evidenceStatus(evidence,hashA)==="reported_pass"],
 ["Mismatched source is outdated",evidenceStatus(evidence,hashB)==="outdated"],
 ["Source changed during run",evidenceStatus({...evidence,sha256Before:hashB},hashA)==="changed_during_run"],
 ["Failed command remains failure",evidenceStatus({...evidence,exitCode:1},hashA)==="reported_fail"],
 ["Signal cannot pass",evidenceStatus({...evidence,signal:"SIGTERM"},hashA)==="reported_fail"]
] as const){if(!condition)throw new Error(label);console.log("PASS "+label)}
let rejected=false;try{parseEvidence({...evidence,sha256After:"fake"})}catch{rejected=true}if(!rejected)throw new Error("Malformed fingerprint accepted");console.log("PASS Invalid evidence rejected");
