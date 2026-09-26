import {parseEvidence} from './evidence';
import {validReview, type Review} from './workspace';

// Imported status claims are deliberately ignored; the UI computes the binding.
export function importHandover(raw:unknown,id:string):Review {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Choose a Memento handover JSON export.');
  const source=(raw as {review?:unknown}).review;
  if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('This is not a handover. Export it from the Handover tab.');
  const r=source as Record<string,unknown>;
  if(r.id==='sample')throw new Error('Sample laboratory exports cannot be imported as repository evidence. Open the built-in SignalGrid sample instead.');
  for(const [key,limit] of [['title',160],['project',100],['file',240]] as const){
    if(typeof r[key]!=='string'||!r[key].trim()||r[key].length>limit)throw new Error('Invalid handover '+key+'.');
  }
  const candidate={id,title:r.title,project:r.project,file:r.file,before:r.before,after:r.after,context:r.context,invariant:r.invariant,notes:r.notes,createdAt:r.createdAt,
    ...(r.evidence===undefined?{}:{evidence:parseEvidence(r.evidence)})};
  if(!validReview(candidate))throw new Error('Invalid handover fields. Each code version must have at most 500 lines and 50,000 characters.');
  if(!candidate.createdAt||!Number.isFinite(Date.parse(candidate.createdAt)))throw new Error('Invalid review creation date.');
  return candidate;
}
