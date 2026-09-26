'use client';
import './evidence-panel.css';
import {useEffect,useState} from 'react';
import {codeHash,evidenceStatus,parseEvidence,type TestEvidence} from '@/lib/memento/evidence';
export default function EvidencePanel({code,file,evidence,onChange}:{code:string;file:string;evidence?:TestEvidence;onChange:(e:TestEvidence)=>void}){
 const [fingerprint,setFingerprint]=useState<{code:string;hash:string;error:string}|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;codeHash(code).then(hash=>{if(active)setFingerprint({code,hash,error:''})}).catch(()=>{if(active)setFingerprint({code,hash:'',error:'Fingerprint unavailable. Use localhost or HTTPS.'})});return()=>{active=false}},[code]);
 const current=fingerprint?.code===code?fingerprint:null;
 const hash=current?.hash||'';
 const status=evidence&&hash?evidenceStatus(evidence,hash):null;
 const labels={outdated:'Different code version',changed_during_run:'Source changed during the run',reported_pass:'Imported command passed',reported_fail:'Imported command failed'};
 const matches=status==='reported_pass'||status==='reported_fail';
 const quotedFile="'"+file.replace(/'/g,"'\\''")+"'";
 const upload=<label className="btn" style={{position:'relative',overflow:'hidden'}}>Choose evidence JSON<input style={{position:'absolute',inset:0,opacity:0,cursor:'pointer',width:'100%'}} aria-label="Import test evidence" type="file" accept=".json,application/json" onChange={async event=>{const f=event.target.files?.[0];if(!f)return;try{if(f.size>250000)throw new Error('Use an evidence file under 250 KB.');onChange(parseEvidence(JSON.parse(await f.text())));setError('')}catch(e){setError(e instanceof Error?e.message:'Cannot read evidence')}event.target.value=''}}/></label>;
 const instructions=<><p>Record your test command locally, then import its JSON record.</p><ol><li>Save the proposed code to <code>{file}</code>.</li><li>From your repository, run the recorder with your test command:</li></ol><pre style={{overflowX:'auto'}}>node scripts/record-memento.cjs {quotedFile} memento-test-run.json -- npm test</pre><p className="small muted">Use a new output filename for each run. For another repository, copy the recorder script there first. Review captured output before sharing.</p>{upload}</>;
 return <section className="panel context-panel evidence-panel">
 {evidence?<>
 <div className={`result-summary ${status==='reported_pass'?'passed':status?'failed':''}`}><div><span className="eyebrow">IMPORTED LOCAL RECORD</span><h2>{status?labels[status]:current?.error?'Fingerprint unavailable':'Checking source fingerprint…'}</h2><p>{matches?'Source fingerprint matches the proposed code.':status==='outdated'?'This record belongs to different source contents.':status==='changed_during_run'?'The source fingerprints differ across the command.':'A matching result has not been established.'}</p></div></div>
 <dl><dt>Command</dt><dd><code>{evidence.command.join(' ')}</code></dd><dt>Source</dt><dd>{evidence.file}</dd><dt>Finished</dt><dd>{evidence.finishedAt}</dd><dt>Exit code</dt><dd>{evidence.exitCode??'None'}{evidence.signal?` · ${evidence.signal}`:''}</dd></dl>
 <p className="small muted">Reported by a local command. Memento has not independently verified execution or test coverage.</p>
 <details><summary>View captured output{evidence.truncated?' (truncated)':''}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{evidence.output||'No output captured.'}</pre></details>
 <details style={{marginTop:16}}><summary>Fingerprint details</summary><dl><dt>Source hash before command</dt><dd style={{overflowWrap:'anywhere'}}><code>{evidence.sha256Before}</code></dd><dt>Source hash after command</dt><dd style={{overflowWrap:'anywhere'}}><code>{evidence.sha256After}</code></dd><dt>Proposed code hash</dt><dd style={{overflowWrap:'anywhere'}}><code>{hash||'Unavailable'}</code></dd></dl><p className="small">Source fingerprints are recorded immediately before and after the command. Matching values mean the recorded contents match at those checkpoints. Memento compares them with the proposed code. This does not independently verify execution, test coverage or other repository files.</p></details>
 <details style={{marginTop:24}}><summary>Add or replace evidence</summary>{instructions}</details>
 </>:<><h3>Add test evidence</h3>{instructions}</>}
 {(error||current?.error)&&<p role="alert" className="error">{error||current?.error}</p>}
 </section>;
}
