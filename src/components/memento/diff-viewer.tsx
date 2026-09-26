"use client";
import {useEffect,useMemo,useState} from "react";
import {diffLines} from "@/lib/memento/workspace";
interface Props {before:string;after:string;file:string}
function Highlight({text}:{text:string}){
  return <>{text.split(/(\/\/.*$|"[^"]*"|'[^']*'|\b(?:export|const|return|if|async|await|true|false|function|let|new)\b|\b\d+\b)/g).map((p,i)=><span key={i} className={p.startsWith("//")?"syntax-comment":/^["']/.test(p)?"syntax-string":/^(export|const|return|if|async|await|true|false|function|let|new)$/.test(p)?"syntax-keyword":/^\d+$/.test(p)?"syntax-number":""}>{p}</span>)}</>;
}
export default function DiffViewer({before,after,file}:Props){
 const [mode,setMode]=useState<"split"|"unified">("split");
 useEffect(()=>{const media=window.matchMedia("(max-width:680px)");const adapt=()=>setMode(media.matches?"unified":"split");adapt();media.addEventListener("change",adapt);return()=>media.removeEventListener("change",adapt)},[]);
 const lines=useMemo(()=>diffLines(before,after),[before,after]);
 const rows=useMemo(()=>{
  const out:{left?:typeof lines[number];right?:typeof lines[number]}[]=[];
  let i=0;while(i<lines.length){if(lines[i].kind==="same"){out.push({left:lines[i],right:lines[i]});i++;continue}
   const removed:typeof lines=[],added:typeof lines=[];
   while(i<lines.length&&lines[i].kind!=="same"){(lines[i].kind==="remove"?removed:added).push(lines[i++])}
   for(let j=0;j<Math.max(removed.length,added.length);j++)out.push({left:removed[j],right:added[j]});
  }return out;
 },[lines]);
 return <section className="studio-code" aria-label="Code comparison">
  <header className="studio-code-header"><span className="file-symbol">⌘</span><code>{file}</code><div className="view-switch" role="group" aria-label="Diff layout"><button aria-pressed={mode==="split"} onClick={()=>setMode("split")}>Split</button><button aria-pressed={mode==="unified"} onClick={()=>setMode("unified")}>Unified</button></div></header>
  <div className="code-legend"><span><i className="before-dot"/>Original</span><span><i className="after-dot"/>Selected change</span></div>
  <div className="studio-code-scroll" tabIndex={0} aria-label="Scrollable code diff">
   {mode==="split"?<div className="split-code">{rows.map((row,i)=><div className="split-row" key={i}>{(["left","right"] as const).map(side=>{const line=row[side];return <div key={side} className={`split-cell ${line?.kind||"gap"}`}><span className="line-num">{side==="left"?line?.old:line?.next}</span><span className="line-sign">{line?.kind==="add"?"+":line?.kind==="remove"?"−":" "}</span><code><Highlight text={line?.text||" "}/></code></div>})}</div>)}</div>:<div className="code-lines">{lines.map((line,i)=><div className={`code-line ${line.kind}`} key={i}><span className="line-num">{line.old??""}</span><span className="line-num">{line.next??""}</span><span className="line-sign">{line.kind==="add"?"+":line.kind==="remove"?"−":" "}</span><code><Highlight text={line.text||" "}/></code></div>)}</div>}
  </div><footer><span>Text comparison</span><span className="diff-stat"><b>+{lines.filter(l=>l.kind==="add").length}</b><em>−{lines.filter(l=>l.kind==="remove").length}</em></span></footer>
 </section>
}
