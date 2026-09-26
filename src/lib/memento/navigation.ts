"use client";
import {useEffect, useRef, useState} from "react";
import {isRevision, type Revision} from "./verification";
export type ReviewTab = "Changes" | "Context" | "Checks" | "Handover";
export type WorkspaceView = "review" | "list" | "history" | "welcome";
interface Navigation {selected:string; revision:Revision; tab:ReviewTab; view:WorkspaceView}
const initial:Navigation={selected:"sample",revision:"candidate",tab:"Changes",view:"welcome"};
function readNavigation():Navigation {
  const p=new URLSearchParams(window.location.search);
  const tab=p.get("tab"), view=p.get("view"), revision=p.get("revision");
  return {selected:p.get("review")||"sample",revision:isRevision(revision)?revision:"candidate",
    tab:(["Changes","Context","Checks","Handover"] as string[]).includes(tab||"")?tab as ReviewTab:"Changes",
    view:view==="list"||view==="history"||view==="review"?view:"welcome"};
}
export function useWorkspaceNavigation(){
  const [navigation,setNavigation]=useState<Navigation>(initial);
  const current=useRef(initial);
  useEffect(()=>{const sync=()=>{current.current=readNavigation();setNavigation(current.current)};sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync)},[]);
  function navigate(patch:Partial<Navigation>){
    const next={...current.current,...patch};current.current=next;setNavigation(next);
    const url=new URL(window.location.href);
    url.searchParams.set("view",next.view);url.searchParams.set("review",next.selected);
    url.searchParams.set("tab",next.tab);url.searchParams.set("revision",next.revision);
    if(url.href!==window.location.href)window.history.pushState(null,"",url);
  }
  return {...navigation,navigate,setSelected:(selected:string)=>navigate({selected}),setRevision:(revision:Revision)=>navigate({revision}),setTab:(tab:ReviewTab)=>navigate({tab}),setView:(view:WorkspaceView)=>navigate({view})};
}
