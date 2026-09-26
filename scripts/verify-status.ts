import {importedStatus} from "../src/lib/memento/review-status";
import type {TestEvidence} from "../src/lib/memento/evidence";
const a="a".repeat(64),b="b".repeat(64);
const e:TestEvidence={schema:"memento.test-evidence.v1",file:"a.ts",sha256Before:a,sha256After:a,command:["npm","test"],startedAt:"2026-09-26T00:00:00Z",finishedAt:"2026-09-26T00:01:00Z",exitCode:0,signal:null,output:"",truncated:false};
const cases=[
 ["No evidence",importedStatus().label==="No evidence"],
 ["Unresolved fingerprint cannot pass",importedStatus(e).tone==="neutral"],
 ["Unavailable fingerprint cannot pass",importedStatus(e,null).tone==="neutral"],
 ["Matching command passes",importedStatus(e,a).tone==="success"],
 ["Different source cannot pass",importedStatus(e,b).tone==="danger"],
 ["Changed source cannot pass",importedStatus({...e,sha256Before:b},a).tone==="danger"],
 ["Nonzero exit cannot pass",importedStatus({...e,exitCode:1},a).tone==="danger"],
 ["Terminated command cannot pass",importedStatus({...e,signal:"SIGTERM"},a).tone==="danger"],
] as const;
for(const [label,pass] of cases){if(!pass)throw new Error(label);console.log("PASS "+label);}
