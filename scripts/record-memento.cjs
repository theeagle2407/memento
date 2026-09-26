#!/usr/bin/env node
// Run locally in your repository. Only executes the explicit command after --.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawn}=require('node:child_process');
const args=process.argv.slice(2), separator=args.indexOf('--');
if(separator!==2||!args[3]){console.error('Usage: node scripts/record-memento.cjs SOURCE_FILE OUTPUT.json -- COMMAND [ARGS...]');process.exit(2)}
const [file,output]=args;const command=args.slice(3);
if(path.resolve(file)===path.resolve(output)||fs.existsSync(output)){console.error('Choose a new output filename; existing files are never overwritten.');process.exit(2)}
function hash(){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
let sha256Before;try{sha256Before=hash()}catch(e){console.error('Cannot read source:',e.message);process.exit(2)}
const startedAt=new Date().toISOString();let log='',truncated=false;
const child=spawn(command[0],command.slice(1),{shell:false,stdio:['inherit','pipe','pipe']});
function capture(data,stream){stream.write(data);const text=data.toString();if(log.length+text.length>100000)truncated=true;log=(log+text).slice(0,100000)}
child.stdout.on('data',d=>capture(d,process.stdout));child.stderr.on('data',d=>capture(d,process.stderr));
child.on('error',e=>{console.error('Could not start command:',e.message);process.exitCode=2});
child.on('close',(exitCode,signal)=>{
 try{const evidence={schema:'memento.test-evidence.v1',file,sha256Before,sha256After:hash(),command,startedAt,finishedAt:new Date().toISOString(),exitCode,signal,output:log,truncated};fs.writeFileSync(output,JSON.stringify(evidence,null,2),{flag:'wx'});console.log('\nEvidence saved:',output);process.exitCode=exitCode===0?0:1}catch(e){console.error('Could not save evidence:',e.message);process.exitCode=2}
});
