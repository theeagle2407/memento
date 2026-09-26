export interface TestEvidence {
  schema: 'memento.test-evidence.v1'; file: string; sha256Before: string; sha256After: string;
  command: string[]; startedAt: string; finishedAt: string; exitCode: number | null;
  signal: string | null; output: string; truncated: boolean;
}
export function parseEvidence(raw: unknown): TestEvidence {
  const e=raw as TestEvidence;
  if(!e || e.schema!=='memento.test-evidence.v1' || typeof e.file!=='string' || e.file.length>1000 ||
    ![e.sha256Before,e.sha256After].every(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)) ||
    !Array.isArray(e.command)||!e.command.length||e.command.length>100||!e.command.every(v=>typeof v==='string'&&v.length<=10000)||
    ![e.startedAt,e.finishedAt].every(v=>typeof v==='string'&&Number.isFinite(Date.parse(v)))||Date.parse(e.finishedAt)<Date.parse(e.startedAt)||
    !(e.exitCode===null||Number.isInteger(e.exitCode))||!(e.signal===null||typeof e.signal==='string')||
    typeof e.output!=='string'||e.output.length>100000||typeof e.truncated!=='boolean') throw new Error('Invalid evidence file. Use the Memento recorder to generate it.');
  return {schema:e.schema,file:e.file,sha256Before:e.sha256Before,sha256After:e.sha256After,command:e.command,startedAt:e.startedAt,finishedAt:e.finishedAt,exitCode:e.exitCode,signal:e.signal,output:e.output,truncated:e.truncated};
}
export function evidenceStatus(e:TestEvidence,sha:string): 'outdated'|'changed_during_run'|'reported_pass'|'reported_fail' {
  if(e.sha256Before!==e.sha256After)return 'changed_during_run';
  if(e.sha256After!==sha)return 'outdated';
  return e.exitCode===0&&e.signal===null?'reported_pass':'reported_fail';
}
export async function codeHash(code:string):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
