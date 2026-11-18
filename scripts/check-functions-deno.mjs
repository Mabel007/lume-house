import {readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const probe=spawnSync('deno',['--version'],{encoding:'utf8'});
if(probe.error?.code==='ENOENT'){
  console.error('BLOCKED: Deno is unavailable. No tooling or dependencies were installed. Run npm run typecheck:functions for available strict source validation.');
  process.exitCode=2;
}else{
  if(probe.error)throw probe.error;
  const entries=readdirSync('supabase/functions',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>join('supabase/functions',d.name,'index.ts')).filter(existsSync);
  const result=spawnSync('deno',['check','--cached-only','--no-lock','--node-modules-dir=none','--config','supabase/functions/deno.json',...entries],{stdio:'inherit'});
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
}
