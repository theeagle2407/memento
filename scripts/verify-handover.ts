import {importHandover} from '../src/lib/memento/import-handover';
import {exportReview,type Review} from '../src/lib/memento/workspace';
import {evidenceStatus} from '../src/lib/memento/evidence';
const hash='a'.repeat(64);
const r:Review={id:'original',title:'Fix pending counts',project:'SignalGrid',file:'router.ts',before:'old',after:'new',context:'Reason',invariant:'Keep pending distinct',notes:'Handover',createdAt:'2026-09-26T00:00:00Z',evidence:{schema:'memento.test-evidence.v1',file:'router.ts',sha256Before:hash,sha256After:hash,command:['npm','test'],startedAt:'2026-09-26T00:00:00Z',finishedAt:'2026-09-26T00:01:00Z',exitCode:1,signal:null,output:'FAIL',truncated:false}};
function check(ok:boolean,label:string){if(!ok)throw new Error(label);console.log('PASS '+label)}
const raw=JSON.parse(exportReview(r,null,hash));
raw.evidenceBinding.status='reported_pass';
const imported=importHandover(raw,'new-id');
check(imported.id==='new-id'&&r.id==='original','Import creates separate identity');
check(imported.before===r.before&&imported.after===r.after&&imported.context===r.context&&imported.invariant===r.invariant&&imported.notes===r.notes,'Code and handover context survive export/import');
check(evidenceStatus(imported.evidence!,hash)==='reported_fail','Forged pass label cannot override failed command');
check(evidenceStatus(imported.evidence!,'b'.repeat(64))==='outdated','Different proposed fingerprint stays mismatched');
check(imported.evidence?.output==='FAIL','Failed output preserved');
for(const [label,value] of [ ['Evidence-only file',r.evidence],['Sample export',{review:{...r,id:'sample'}}],['Oversized code',{review:{...r,after:'x'.repeat(50001)}}],['Invalid evidence',{review:{...r,evidence:{...r.evidence,sha256After:'bad'}}}],['Missing context',{review:{...r,context:undefined}}] ] as const){let rejected=false;try{importHandover(value,'new')}catch{rejected=true}check(rejected,label+' rejected');}
check(!importHandover({review:{...r,evidence:undefined}},'clean').evidence,'Review without evidence remains without evidence');
