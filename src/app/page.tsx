"use client";
import "./studio.css";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { REVISIONS, type Revision, type Verification } from "@/lib/memento/verification";
import { bobPrompt, diffLines, exportReview, sampleReview, validReview, type Review } from "@/lib/memento/workspace";

import {importHandover} from "@/lib/memento/import-handover";
import {importedStatus} from "@/lib/memento/review-status";
import {codeHash} from "@/lib/memento/evidence";
import EvidencePanel from "@/components/memento/evidence-panel";
import DiffViewer from "@/components/memento/diff-viewer";
import {useWorkspaceNavigation, type ReviewTab as Tab} from "@/lib/memento/navigation";

const STORAGE = "memento.workspace.v1";
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string,string> = {
    grid:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    code:"m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16", branch:"M6 6v12m0-10c0 4 12 0 12 7 M4 3h4v4H4z M4 17h4v4H4z M16 14h4v4h-4z",
    check:"m5 12 4 4L19 6", arrow:"M5 12h14m-6-6 6 6-6 6", plus:"M12 5v14M5 12h14",
    search:"M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6", clock:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v5l3 2",
    file:"M5 3h9l5 5v13H5z M14 3v6h5M8 13h8M8 17h6", play:"m8 5 11 7-11 7z",
    download:"M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5", close:"m6 6 12 12M6 18 18 6",
    help:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m-3 5a3 3 0 0 1 6 0c0 2-3 2-3 5m0 2v1",
    shield:"m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z", chevron:"m9 5 7 7-7 7", copy:"M8 8h12v13H8z M4 16H3V3h12v1",
    dot:"M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14", warning:"m12 3 10 18H2z M12 9v5m0 2v1",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.file}/></svg>;
}
function Badge({ children, tone = "neutral" }: {children:ReactNode; tone?:string}) { return <span className={`badge ${tone}`}>{children}</span>; }
function Modal({ title, children, close }: {title:string;children:ReactNode;close:()=>void}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>("button,input,textarea")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,a[href]');
        if (!nodes?.length) return;
        if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length-1].focus(); }
        if (!e.shiftKey && document.activeElement === nodes[nodes.length-1]) { e.preventDefault(); nodes[0].focus(); }
      }
    };
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    document.addEventListener("keydown",handler);
    return () => { document.removeEventListener("keydown",handler); document.body.style.overflow = overflow; previous?.focus(); };
  }, [close]);
  return <div className="modal-backdrop"><div className="modal" ref={ref} role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">MEMENTO</span><h2>{title}</h2></div><button className="icon-btn" aria-label="Close dialog" onClick={close}><Icon name="close"/></button></header>{children}</div></div>;
}
function NewReview({ save, close }: {save:(review:Review)=>void;close:()=>void}) {
  const [title,setTitle] = useState(""), [project,setProject] = useState(""), [file,setFile] = useState("");
  const [before,setBefore] = useState(""), [after,setAfter] = useState(""), [context,setContext] = useState("");
  const [error,setError] = useState("");
  async function readFile(input: HTMLInputElement, setter:(s:string)=>void) {
    const selected = input.files?.[0]; if (!selected) return;
    if (selected.size > 50000) { setError("Choose a text file under 50 KB."); return; }
    const text = await selected.text();
    if (text.includes("\0") || text.split("\n").length > 500) { setError("Choose a text file with up to 500 lines."); return; }
    setter(text); if (!file) setFile(selected.name); setError("");
  }
  return <Modal title="New change review" close={close}><form onSubmit={e => {
    e.preventDefault();
    if ([before,after].some(s=>s.length>50000||s.split("\n").length>500)) { setError("Use up to 500 lines and 50 KB per version.");return; }
    if (!title.trim() || !project.trim() || !file.trim() || !after.trim()) { setError("Add a title, project, file path and proposed code.");return; }
    save({id:crypto.randomUUID(),title:title.trim(),project:project.trim(),file:file.trim(),before,after,context,invariant:"",notes:"",createdAt:new Date().toISOString()});
  }}><div className="modal-body"><p className="muted">Add both versions of a file to start a review.</p>
    <label>Change title<input autoComplete="off" required maxLength={160} placeholder="What are you changing?" value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <div className="form-pair"><label>Project<input required maxLength={100} placeholder="my-project" value={project} onChange={e=>setProject(e.target.value)}/></label><label>File path<input required maxLength={240} placeholder="src/services/delivery.ts" value={file} onChange={e=>setFile(e.target.value)}/></label></div>
    <div className="form-pair code-inputs"><label><span className="label-row">Original <span className="file-upload">Load file<input aria-label="Load original code" type="file" onChange={e=>void readFile(e.currentTarget,setBefore)}/></span></span><textarea aria-label="Original code" maxLength={50000} spellCheck={false} placeholder="Paste original code. Leave empty for a new file." value={before} onChange={e=>setBefore(e.target.value)}/></label>
    <label><span className="label-row">Proposed <span className="file-upload">Load file<input aria-label="Load proposed code" type="file" onChange={e=>void readFile(e.currentTarget,setAfter)}/></span></span><textarea aria-label="Proposed code" required maxLength={50000} spellCheck={false} placeholder="Paste the changed code" value={after} onChange={e=>setAfter(e.target.value)}/></label></div>
    <label>Context <span className="optional">Optional</span><textarea maxLength={10000} placeholder="Why this change is needed. Paste relevant requirements or documentation." value={context} onChange={e=>setContext(e.target.value)}/></label>
    <p className="small muted">Your code stays in this browser. Imported code is not executed or automatically analysed.</p>{error && <p role="alert" className="error">{error}</p>}</div>
    <footer><button type="button" className="btn" onClick={close}>Cancel</button><button className="btn primary" type="submit">Create review <Icon name="arrow" size={15}/></button></footer></form></Modal>;
}
export default function Home() {
  const [reviews,setReviews] = useState<Review[]>([]), [ready,setReady] = useState(false);
  const {selected,setSelected,revision,setRevision,tab,setTab,view,setView,navigate}=useWorkspaceNavigation();
  const [query,setQuery] = useState(""), [newReview,setNewReview] = useState(false), [help,setHelp] = useState(false);
  const [runs,setRuns] = useState<Verification[]>([]), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const [storageError,setStorageError] = useState(""), [sampleNotes,setSampleNotes] = useState("");
  const [fingerprints,setFingerprints] = useState<Record<string,{code:string;hash:string|null}>>({});
  useEffect(()=>{
    let active=true;
    Promise.all(reviews.filter(r=>r.evidence).map(async r=>{
      try {return [r.id,{code:r.after,hash:await codeHash(r.after)}] as const;}
      catch {return [r.id,{code:r.after,hash:null}] as const;}
    })).then(entries=>{if(active)setFingerprints(Object.fromEntries(entries));});
    return ()=>{active=false;};
  },[reviews]);
  function reviewStatus(r:Review) {
    if(r.id==="sample") {
      const run=runs.find(item=>item.candidate.revision===revision);
      return {label:run?(run.candidate.passed?"Checks passed":"Changes needed"):"Not run",tone:run?(run.candidate.passed?"success":"danger"):"neutral"};
    }
    const saved=fingerprints[r.id];
    return importedStatus(r.evidence,saved?.code===r.after?saved.hash:undefined);
  }
  const handoverInput=useRef<HTMLInputElement>(null);
  const [importError,setImportError]=useState("");
  const [importBusy,setImportBusy]=useState(false);
  const searchRef=useRef<HTMLInputElement>(null);
  const isSample = selected === "sample";
  const review = isSample ? {...sampleReview(revision),notes:sampleNotes} : reviews.find(r=>r.id===selected) || sampleReview(revision);
  const result = isSample ? runs.find(r=>r.candidate.revision===revision) || null : null;
  const lines = useMemo(()=>diffLines(review.before,review.after),[review.before,review.after]);
  const additions=lines.filter(l=>l.kind==="add").length, removals=lines.filter(l=>l.kind==="remove").length;
  useEffect(()=>{
    try { const raw=localStorage.getItem(STORAGE); if(raw) { const parsed:unknown=JSON.parse(raw); if(!Array.isArray(parsed)||!parsed.every(validReview)) throw new Error(); setReviews(parsed.slice(0,20)); } }
    catch { setStorageError("Saved reviews could not be loaded. Existing storage has not been overwritten."); }
    setReady(true);
  },[]);
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{ if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setView("list");searchRef.current?.focus();} };
    window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);
  },[]);
  useEffect(()=>{
    if(ready && selected!=="sample" && !reviews.some(r=>r.id===selected)){
      navigate({selected:"sample",view:"list",tab:"Changes"});
      setMessage("That review is not stored in this browser.");
    }
  },[ready,selected,reviews]);
  function persist(next:Review[]) {
    setReviews(next);
    if(storageError) { setMessage("Review kept for this session only. Export it before leaving."); return; }
    try {localStorage.setItem(STORAGE,JSON.stringify(next));} catch {setStorageError("Browser storage is full or unavailable. Export your reviews before leaving.");}
  }
  function update(fields:Partial<Review>) { if(isSample){if(fields.notes!==undefined)setSampleNotes(fields.notes);} else persist(reviews.map(r=>r.id===selected?{...r,...fields}:r)); }
  function openReview(id:string) {navigate({selected:id,view:"review",tab:"Changes"});setMessage("");}
  async function verify() {
    if(!isSample||busy)return;setBusy(true);setMessage("");setTab("Checks");
    try {
      const response=await fetch("/api/memento/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision}),signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Verification failed.");
      if(!data.runId||!Array.isArray(data.candidate?.checks)||data.candidate.revision!==revision)throw new Error("Unexpected verification response.");
      setRuns(previous=>[data as Verification,...previous].slice(0,30));
    } catch(error){setMessage(error instanceof Error?error.message:"Could not run verification.");}finally{setBusy(false);}
  }
  async function loadHandover(file:File) {
    if(!ready||importBusy||reviews.length>=20)return;
    setImportBusy(true);setImportError("");
    try {
      if(file.size>500000)throw new Error("Choose a handover smaller than 500 KB.");
      const imported=importHandover(JSON.parse(await file.text()),crypto.randomUUID());
      // Compute before saving too: no claimed export status is accepted as proof.
      await codeHash(imported.after);
      persist([imported,...reviews]);
      openReview(imported.id);
      setMessage("Handover imported as a separate review. Attached command evidence is checked against its proposed code.");
    } catch(error){setImportError(error instanceof Error?error.message:"Could not import this handover.");}
    finally{setImportBusy(false);}
  }
  async function copyPrompt(){try{await navigator.clipboard.writeText(bobPrompt(review));setMessage("Review prompt copied. Paste it into Bob with your project open.");}catch{setMessage("Clipboard access unavailable. Export the review to retain its code and context.");}}
  async function download(){try{const blob=new Blob([exportReview(review,result,await codeHash(review.after))],{type:"application/json"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`memento-${review.project.replace(/[^a-z0-9-]/gi,"-")}-review.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setMessage("Export failed. Your review is still available here. Check that you are using localhost or HTTPS, then try again.");}}
  const currentStatus=reviewStatus(review);
  const status=currentStatus.label;
  return <div className={`workspace ${view==="welcome"?"welcome-mode":""}`}>
    <nav className="icon-rail" aria-label="Workspace tools"><button className="rail-logo" aria-label="Start" onClick={()=>setView("welcome")}>m<span>·</span></button><button title="Change reviews" aria-label="All change reviews" className={view!=="history"?"rail-active":""} onClick={()=>setView("list")}><Icon name="code"/></button><button title="Run history" aria-label="All runs" className={view==="history"?"rail-active":""} onClick={()=>setView("history")}><Icon name="clock"/></button><div className="spacer"/><button aria-label="Workspace help" onClick={()=>setHelp(true)}><Icon name="help"/></button><span className="rail-user">L</span></nav>
    <aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setView("list");}}><span className="brand-mark">m<span>·</span></span><span>memento<span className="brand-caption">MAINTENANCE WORKSPACE</span></span></a>
      <div className="workspace-label"><span className="workspace-avatar">L</span><div>Local workspace<small>Personal</small></div><span className="local-dot" title="Local browser workspace"/></div>
      <span className="nav-caption">WORKSPACE</span><nav aria-label="Main navigation"><button className={view!=="history"?"nav-item active":"nav-item"} onClick={()=>setView("list")}><Icon name="code"/>Change reviews<span className="nav-count">{reviews.length+1}</span></button><button className={view==="history"?"nav-item active":"nav-item"} onClick={()=>setView("history")}><Icon name="clock"/>Run history<span className="nav-count">{runs.length}</span></button></nav>
      <div className="sidebar-projects"><span className="nav-caption">PINNED SAMPLE</span><button className={isSample&&view==="review"?"project-link selected":"project-link"} onClick={()=>openReview("sample")}><span className="project-logo">S</span><span>SignalGrid<small>Retry ownership</small></span><Icon name="chevron" size={13}/></button></div>
      <div className="saved-navigation"><span className="nav-caption">YOUR REVIEWS</span><button className="text-btn" disabled={!ready||importBusy||reviews.length>=20} onClick={()=>handoverInput.current?.click()}><Icon name="file" size={14}/>{importBusy?"Importing…":"Import handover"}</button>{reviews.length?reviews.map(r=><button className={selected===r.id?"saved-link selected":"saved-link"} key={r.id} onClick={()=>openReview(r.id)}><Icon name="file" size={14}/><span>{r.title}</span></button>):<p>No saved changes yet.</p>}<button className="text-btn" disabled={!ready||reviews.length>=20} onClick={()=>setNewReview(true)}><Icon name="plus" size={14}/>Add a change</button></div><div className="sidebar-bottom"><div className="side-note"><Icon name="shield" size={19}/><strong>Context that stays.</strong><p></p></div><button className="nav-item" onClick={()=>setHelp(true)}><Icon name="help"/>How Memento works</button><div className="sidebar-footer"><span className="avatar">Y</span><span>Your workspace</span><Badge>LOCAL</Badge></div></div>
    </aside>
    <div className="app-main"><header className="topbar"><div className="breadcrumbs"><Icon name="grid" size={16}/><span>Workspace</span><Icon name="chevron" size={12}/><strong>{view==="history"?"Run history":"Change reviews"}</strong></div><div className="search"><Icon name="search" size={15}/><input aria-label="Search reviews" ref={searchRef} placeholder="Search reviews…" value={query} onChange={e=>{setQuery(e.target.value);setView("list");}}/><kbd>⌘ K</kbd></div><button className="icon-btn" aria-label="Help" onClick={()=>setHelp(true)}><Icon name="help"/></button></header>
      {storageError&&<div className="storage-warning" role="alert">{storageError}</div>}
      <main className="main-content">
      <input ref={handoverInput} type="file" accept=".json,application/json" hidden aria-label="Choose handover JSON" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void loadHandover(file);}}/>
      {importError&&<div className="storage-warning" role="alert">{importError}<button className="text-btn" onClick={()=>setImportError("")}>Dismiss</button></div>}

      {view==="welcome"&&<section className="welcome"><header className="welcome-top"><span className="welcome-brand">memento<span>·</span></span><button className="btn" onClick={()=>setView("list")}>Open workspace<Icon name="arrow" size={16}/></button></header><div className="welcome-body"><span className="eyebrow">CODE MAINTENANCE</span><h1>A change is more than a diff.</h1><p className="welcome-intro">Understand why it exists, check what it could break, and leave the next developer the context.</p><div className="start-panel"><div className="start-panel-heading"><Icon name="branch" size={22}/><div><h2>Start a change review</h2><p>One place for the code, the reasoning, and the evidence.</p></div></div><div className="start-options"><div><span className="start-number">01 / EXPLORE</span><h3>Try the working sample</h3><p>A retry change recovers failed alerts—but introduces duplicate operations. Find the failure and verify the correction.</p><button className="btn primary" onClick={()=>navigate({selected:"sample",revision:"candidate",tab:"Changes",view:"review"})}>Try SignalGrid<Icon name="arrow" size={16}/></button><small>Local simulation · no setup required</small></div><div><span className="start-number">02 / YOUR CODE</span><h3>Bring a change</h3><p>Compare two versions of a file, add requirements, and prepare a focused review task for Bob.</p><button className="btn" disabled={!ready||reviews.length>=20} onClick={()=>setNewReview(true)}>Add your change<Icon name="plus" size={16}/></button><small>Saved in this browser · code is not executed</small></div></div></div><div className="welcome-flow"><span>Inspect the diff</span><Icon name="chevron" size={13}/><span>Keep the context</span><Icon name="chevron" size={13}/><span>Check & hand over</span></div></div></section>}

      {view==="list"&&<><div className="page-heading"><div><span className="eyebrow">WORKSPACE</span><h1>Change reviews<span className="heading-count">{reviews.length+1}</span></h1><p>Keep the reason for a change next to the code.</p></div><button className="btn primary" disabled={!ready||reviews.length>=20} onClick={()=>setNewReview(true)}><Icon name="plus" size={16}/>New review</button></div>
        <section className="review-table"><div className="table-header"><span>Change</span><span>Project</span><span>Verification</span></div>{[sampleReview(revision),...reviews].filter(r=>`${r.title} ${r.project} ${r.file}`.toLowerCase().includes(query.toLowerCase())).map(r=><button key={r.id} className="review-row" onClick={()=>openReview(r.id)}><div><Icon name="branch"/><span><strong>{r.title}</strong><small>{r.file}</small></span></div><span>{r.project} {r.id==="sample"&&<Badge>Sample</Badge>}</span><span><Badge tone={reviewStatus(r).tone}>{reviewStatus(r).label}</Badge><Icon name="chevron" size={14}/></span></button>)}{![sampleReview(revision),...reviews].some(r=>`${r.title} ${r.project} ${r.file}`.toLowerCase().includes(query.toLowerCase()))&&<div className="empty-state"><Icon name="search"/><h3>No matching reviews</h3><p>Try another title, project or file.</p></div>}</section><p className="table-note">Reviews stay in this browser. Export a handover and use Import handover in another workspace to reopen it. Up to 20 reviews.</p></>}
      {view==="history"&&<><div className="page-heading"><div><span className="eyebrow">VERIFICATION</span><h1>Run history</h1><p>Results from this session. Sample laboratory only.</p></div><button className="btn" onClick={()=>openReview("sample")}>Open sample <Icon name="arrow" size={15}/></button></div><section className="panel">{runs.length===0?<div className="empty-state"><Icon name="clock" size={30}/><h3>No runs yet</h3><p>Open SignalGrid and verify a change to see its checks and trace.</p></div>:runs.map(run=><button className="run-row" key={run.runId} onClick={()=>{setSelected("sample");setRevision(run.candidate.revision);setRuns(prev=>[run,...prev.filter(r=>r.runId!==run.runId)]);setTab("Checks");setView("review");}}><Badge tone={run.candidate.passed?"success":"danger"}>{run.candidate.passed?"Passed":"Failed"}</Badge><strong>{REVISIONS[run.candidate.revision].label}</strong><code>{run.runId.slice(0,8)}</code><span>{new Date(run.createdAt).toLocaleTimeString()}</span><Icon name="chevron" size={14}/></button>)}</section></>}
      {view==="review"&&<>
        <div className="review-topline"><button className="back-link" onClick={()=>setView("list")}>Change reviews</button><Icon name="chevron" size={12}/><span>{review.project}</span><span className="spacer"/><button className="btn small-btn" disabled={!ready||reviews.length>=20} onClick={()=>setNewReview(true)}><Icon name="plus" size={14}/>New review</button></div>
        <div className="page-heading detail-heading"><div><div className="issue-id"><span className="issue-dot"/> {isSample?"SG • MAINTENANCE":"LOCAL • REVIEW"}{isSample&&<Badge>Sample project</Badge>}</div><h1>{review.title}</h1><div className="issue-meta"><span><Icon name="branch" size={14}/>{review.project}</span><span>1 file</span><span className="diff-stat"><b>+{additions}</b><em>−{removals}</em></span><span>Code review</span></div></div><div className="heading-actions"><button className="btn" onClick={download}><Icon name="download" size={15}/>Export</button><button className="btn primary" disabled={busy} onClick={()=>isSample?void verify():void copyPrompt()}><Icon name={busy?"clock":isSample?"play":"copy"} size={15}/>{busy?"Running…":isSample?"Verify change":"Prepare Bob review"}</button></div></div>
        <div className="tabbar" role="tablist" aria-label="Review details">{(["Changes","Context","Checks","Handover"] as Tab[]).map(t=><button role="tab" tabIndex={tab===t?0:-1} onKeyDown={e=>{const tabs:Tab[]=["Changes","Context","Checks","Handover"];const i=tabs.indexOf(t);const next=e.key==="ArrowRight"?tabs[(i+1)%4]:e.key==="ArrowLeft"?tabs[(i+3)%4]:e.key==="Home"?tabs[0]:e.key==="End"?tabs[3]:null;if(next){e.preventDefault();setTab(next);const buttons=e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]");buttons?.[tabs.indexOf(next)].focus();}}} aria-selected={tab===t} key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t}{t==="Changes"&&<span>1</span>}{t==="Checks"&&result&&<span className={result.candidate.passed?"count-success":"count-danger"}>{result.candidate.checks.filter(c=>c.pass).length}/{result.candidate.checks.length}</span>}</button>)}<div className="tab-status"><span className={`status-dot ${currentStatus.tone==="success"?"good":currentStatus.tone==="danger"?"bad":""}`}/>{status}</div></div>
        <div role="status" aria-live="polite">{message&&<div className="notice">{message}<button className="icon-btn" aria-label="Dismiss message" onClick={()=>setMessage("")}><Icon name="close" size={14}/></button></div>}</div>
        <div className="review-layout"><div className="review-center">
          {tab==="Changes"&&<>
            {isSample?<div className="insight"><div className="insight-icon"><Icon name="shield" size={20}/></div><div><strong>Preserve delivery ownership.</strong><p>One event. One recipient. One active operation.</p></div><button className="text-btn" onClick={()=>setTab("Context")}>View context <Icon name="arrow" size={14}/></button></div>:<div className="insight"><div className="insight-icon"><Icon name="file"/></div><div><strong>Your change is ready to review.</strong><p>Add the behaviour to preserve in Context. Prepare a Bob review when ready.</p></div></div>}
            <div className="revision-toolbar"><div><span className="eyebrow">CHANGESET</span><span>{additions||removals?"1 file changed":"No code differences"}</span><span className="diff-stat"><b>+{additions}</b><em>−{removals}</em></span></div>{isSample&&<select aria-label="Sample revision" value={revision} disabled={busy} onChange={e=>{setRevision(e.target.value as Revision);setMessage("");}}>{Object.entries(REVISIONS).map(([key,value])=><option value={key} key={key}>{value.label}</option>)}</select>}</div>
            <DiffViewer before={review.before} after={review.after} file={review.file}/>

            <section className="panel note-panel"><div className="section-heading"><Icon name="file" size={16}/><h3>Maintainer notes</h3><span className="spacer"/><span className="muted small">{isSample?"This session":"Saved locally"}</span></div><textarea aria-label="Maintainer notes" value={review.notes} maxLength={10000} onChange={e=>update({notes:e.target.value})} placeholder="Leave the next maintainer a reason, a concern, or a decision…"/></section>
          </>}
          {tab==="Context"&&<><section className="panel context-panel"><div className="section-heading"><Icon name="file"/><h3>Why this change exists</h3><span className="spacer"/><Badge>{isSample?"Sample requirement":"Your context"}</Badge></div>{isSample?<p>{review.context}</p>:<textarea aria-label="Review context" value={review.context} maxLength={10000} onChange={e=>update({context:e.target.value})} placeholder="Paste the requirement, issue description, or relevant documentation."/>}<hr/><h3>Behaviour to preserve</h3>{isSample?<p>{review.invariant}</p>:<textarea aria-label="Behaviour to preserve" maxLength={10000} value={review.invariant} onChange={e=>update({invariant:e.target.value})} placeholder="What must remain true after this change?"/>}</section>{isSample&&<section className="panel context-panel"><h3>What the sample checks</h3><p>The original limit allows three attempts. This lab simulates three failures before success, so the original exhausts its retries. The proposed change allows six attempts but disables the claim. Two callers can then complete separate operations.</p><p>The corrected change keeps five retries and restores the claim. These are fixed, inspectable configurations executed by the same runner, not arbitrary code analysis.</p><div className="source-link"><Icon name="code"/><code>src/lib/memento/verification.ts</code></div><p className="small muted">All timing and transport outcomes are simulated. This does not prove exactly-once external delivery, distributed locking, or recovery after a process crash.</p></section>}</>}
          {tab==="Checks"&&<>
            {!isSample?<><EvidencePanel code={review.after} file={review.file} evidence={review.evidence} onChange={evidence=>update({evidence})}/><section className="panel empty-state"><Icon name="code" size={30}/><h2>Review with your repository open</h2><p>Memento keeps your diff and context together. Copy the prepared task into Bob to inspect the repository and develop a regression test.</p><button className="btn primary" onClick={()=>void copyPrompt()}><Icon name="copy" size={16}/>Copy Bob review prompt</button><p className="small muted">Memento does not run imported code.</p></section></>:busy?<section className="panel checks-loading" aria-live="polite" aria-busy="true"><h3>Running verification…</h3><p>Comparing the original and selected change.</p>{[0,1,2,3].map(n=><div className="skeleton-row" key={n}><span/><i/><i/></div>)}</section>:!result?<section className="panel empty-state"><Icon name="play" size={30}/><h2>See what this change breaks.</h2><p>Run the original and proposed configuration against the same four checks.</p><button className="btn primary" onClick={()=>void verify()}>Run verification <Icon name="arrow" size={16}/></button></section>:<>
              <div className={`result-summary ${result.candidate.passed?"passed":"failed"}`}><Icon name={result.candidate.passed?"check":"warning"} size={22}/><div><h2>{result.candidate.passed?"Verification passed":"Changes required"}</h2><p>{result.candidate.passed?"Recovery works and the local delivery claim is preserved.":"Review the failed checks below."}</p></div><Badge tone={result.candidate.passed?"success":"danger"}>{result.candidate.checks.filter(c=>c.pass).length} / {result.candidate.checks.length}</Badge></div>
              <section className="panel checks-panel"><div className="check-header"><strong>Regression checks</strong><span>Original</span><span>{REVISIONS[revision].label}</span></div>{result.candidate.checks.map((check,i)=><details className="check-detail" key={check.label}><summary><span>{check.label}</span><span className={result.baseline.checks[i].pass?"pass-text":"fail-text"}>{result.baseline.checks[i].pass?"Pass":"Fail"}</span><span className={check.pass?"pass-text":"fail-text"}>{check.pass?"Pass":"Fail"}<Icon name="chevron" size={12}/></span></summary><p>{check.detail}</p></details>)}<div className="run-metadata"><code>Run {result.runId.slice(0,8)}</code><span>{new Date(result.createdAt).toLocaleTimeString()}</span><span>{result.durationMs} ms server execution</span></div></section>
              {revision==="candidate"&&<div className="repair-bar"><div><strong>Preserve ownership before increasing retries.</strong><p>Restore the claim, then verify again.</p></div><button className="btn primary" onClick={()=>{setRevision("repaired");setTab("Changes");setMessage("Corrected sample selected. Review its diff, then verify it. Your repository files have not changed.");}}>Review correction <Icon name="arrow" size={15}/></button></div>}
              <section className="panel"><div className="section-heading trace-title"><Icon name="clock" size={17}/><h3>Execution trace</h3><span className="spacer"/><span className="small muted">Ordered events · simulated transport</span></div><div className="trace-stats"><div><strong>{result.candidate.operations}</strong><span>Concurrent operations</span></div><div><strong>{result.candidate.attempts}</strong><span>Initial transport attempts</span></div><div><strong>{result.candidate.completed}</strong><span>Initial completions</span></div></div><div className="trace-list">{result.candidate.trace.map(event=><div className="trace-row" key={event.sequence}><span className="trace-order">{String(event.sequence).padStart(2,"0")}</span><span className={`worker-tag ${event.worker==="Worker B"?"worker-b":""}`}>{event.worker}</span><span>{event.event}</span>{event.attempt&&<code>#{event.attempt}</code>}</div>)}</div></section>
            </>}
          </>}
          {tab==="Handover"&&<section className="panel handover"><div className="handover-heading"><div className="document-icon"><Icon name="file" size={25}/></div><div><span className="eyebrow">REVIEW RECORD</span><h2>Handover record</h2></div></div><dl><dt>Change</dt><dd>{review.title}</dd><dt>File</dt><dd><code>{review.file}</code></dd><dt>Context</dt><dd>{review.context||"No context added."}</dd><dt>Preserve</dt><dd>{review.invariant||"No behaviour recorded."}</dd><dt>Verification</dt><dd><Badge tone={currentStatus.tone}>{status}</Badge>{result&&<p>{result.candidate.checks.filter(c=>c.pass).length} of {result.candidate.checks.length} checks passed for {REVISIONS[revision].label.toLowerCase()}. Sample scope only.</p>}</dd><dt>Imported evidence</dt><dd>{review.evidence?`${status} · local command exit ${review.evidence.exitCode??"unknown"}. Not independently verified.`:"None attached."}</dd><dt>Notes</dt><dd>{review.notes||"No maintainer notes yet."}</dd></dl><div className="handover-footer"><p>Export includes both code versions, context, notes, and attached evidence with its source binding.</p><button className="btn primary" onClick={download}><Icon name="download" size={16}/>Download handover</button></div></section>}
        </div><aside className="context-sidebar"><div className="sidebar-section"><h3>Review details</h3><dl><dt>Project</dt><dd><span className="mini-project">{review.project.charAt(0)}</span>{review.project}</dd><dt>Source</dt><dd>{isSample?"Local sample":"Pasted / uploaded"}</dd><dt>Status</dt><dd><Badge tone={currentStatus.tone}>{status}</Badge></dd><dt>Storage</dt><dd>{isSample?"Sample + session runs":"This browser"}</dd></dl></div>
          <div className="sidebar-section"><div className="section-heading"><Icon name="shield" size={16}/><h3>Required behaviour</h3></div><p>{review.invariant||"Add the behaviour this change must preserve."}</p><button className="text-btn" onClick={()=>setTab("Context")}>{isSample?"Inspect context":"Add context"}<Icon name="arrow" size={13}/></button></div>
          {isSample&&<div className="sidebar-section"><h3>Sample revisions</h3>{Object.entries(REVISIONS).map(([key,config])=><button className={`revision-link ${revision===key?"chosen":""}`} key={key} disabled={busy} onClick={()=>{setRevision(key as Revision);setTab("Changes");setMessage("");}}><span className="revision-circle"/><span>{config.label}<small>{config.maxRetries} retries · claim {config.preserveClaim?"preserved":"removed"}</small></span></button>)}</div>}
          <div className="scope-note"><Icon name="dot" size={14}/><p>{isSample?"Fictional, single-process lab. External delivery is not tested.":"Imported records come from your local command. Memento does not execute this code or independently verify the record."}</p></div>
        </aside></div>
        <nav className="flow-footer" aria-label="Review workflow"><div><span className="eyebrow">STEP {(["Changes","Context","Checks","Handover"] as Tab[]).indexOf(tab)+1} OF 4</span><p>{tab==="Changes"?"Inspect what changed, then capture the reason.":tab==="Context"?"Keep the requirement and the behaviour to preserve together.":tab==="Checks"?isSample?"Keep the actual result—even when checks fail.":"Run the prepared task in Bob with your repository open.":"Take the code, context and evidence with you."}</p></div><div className="flow-actions">{tab!=="Changes"&&<button className="btn" onClick={()=>setTab((["Changes","Context","Checks","Handover"] as Tab[])[(["Changes","Context","Checks","Handover"] as Tab[]).indexOf(tab)-1])}>Back</button>}{tab!=="Handover"?<button className="btn primary" onClick={()=>setTab(tab==="Changes"?"Context":tab==="Context"?"Checks":"Handover")}>{tab==="Changes"?"Review context":tab==="Context"?"Review checks":"Prepare handover"}<Icon name="arrow" size={15}/></button>:<button className="btn primary" onClick={download}>Export handover<Icon name="download" size={15}/></button>}</div></nav>
      </>}
      </main><footer className="app-footer"><span><span className="status-dot good"/>Local workspace</span><span>memento / keep the context.</span></footer>
    </div>
    {newReview&&<NewReview close={()=>setNewReview(false)} save={r=>{persist([r,...reviews]);setNewReview(false);openReview(r.id);}}/>}
    {help&&<Modal title="Change code. Keep the context." close={()=>setHelp(false)}><div className="modal-body help-body"><p>Memento is a maintenance review workspace for developers working on unfamiliar code.</p><ol><li><strong>Add a change.</strong> Paste or load the original and proposed versions of one file.</li><li><strong>Keep the reason.</strong> Add requirements, behaviour to preserve and maintainer notes.</li><li><strong>Review with Bob.</strong> Copy the task into Bob with the repository open. Imported code is not executed here.</li><li><strong>Hand it over.</strong> Export the code, context and recorded evidence together.</li></ol><div className="insight"><div><strong>Try SignalGrid</strong><p>The sample supports live checks of three fixed configurations. Compare a failing proposal with a corrected one.</p></div></div><p className="small muted">This build has no GitHub connection, automatic AI analysis, shared accounts, or arbitrary repository execution. Reviews are saved on this browser; sample runs last for the session.</p></div><footer><button className="btn primary" onClick={()=>setHelp(false)}>Back to workspace <Icon name="arrow" size={16}/></button></footer></Modal>}
  </div>;
}
