import {execFileSync} from 'node:child_process';
import {localDockerEnv} from './docker-guard.mjs';
try{
 const options={headers:{Origin:'http://127.0.0.1:5188'},signal:AbortSignal.timeout(2000)};
 const health=await fetch('http://127.0.0.1:5190/health',options);
 if(health.ok){const value=await health.json();if(value.project==='lume-house'&&value.purpose==='local-qa')await fetch('http://127.0.0.1:5190/shutdown',{...options,method:'POST',signal:AbortSignal.timeout(2000)});}
}catch{ /* Frontend helper may already be stopped. */ }
const ids=execFileSync('docker',['ps','-aq','--filter','label=com.supabase.cli.project=lume-house'],{encoding:'utf8',env:localDockerEnv}).trim().split(/\s+/).filter(Boolean);
for(const id of ids){const c=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8',env:localDockerEnv}))[0];if(c.Config.Labels?.['com.supabase.cli.project']!=='lume-house')throw new Error('Ownership mismatch');if(c.State.Running)execFileSync('docker',['stop',id],{stdio:'ignore',env:localDockerEnv});}
console.log('Stopped only verified Lumé containers; retained data, volumes and networks. No prune.');
