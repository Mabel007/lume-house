import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,copyFileSync,readdirSync,cpSync,readFileSync,unlinkSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {startDockerGuard,dockerRequest,localDockerEnv} from './docker-guard.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const workdir=resolve(root,'.codex/local-stack'),project='lume-house';
function baseline(){return execFileSync('docker',['ps','-aq'],{encoding:'utf8',env:localDockerEnv}).trim().split(/\s+/).filter(Boolean).map(id=>{
 const value=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8',env:localDockerEnv}))[0];
 return {id:value.Id,name:value.Name,state:value.State.Status,started:value.State.StartedAt,ports:value.HostConfig.PortBindings,project:value.Config.Labels?.['com.supabase.cli.project']};
});}
async function cli(args,env){
 const child=process.env.LOCAL_SUPABASE_CLI?spawn(process.env.LOCAL_SUPABASE_CLI,[...args,'--workdir',workdir],{cwd:root,env,windowsHide:true}):spawn('npx.cmd',['--yes','supabase@2.120.0',...args,'--workdir',workdir],{cwd:root,env,windowsHide:true,shell:true});
 let text='',errors='';child.stdout.on('data',chunk=>{text+=chunk;});child.stderr.on('data',chunk=>{errors+=chunk;});
 const code=await new Promise(resolve=>{child.on('exit',resolve);child.on('error',()=>resolve(1));});
 if(code!==0)throw new Error('Local CLI failed: '+args.join(' ')+'; '+(errors+text).replace(/sb_\S+|eyJ\S+|postgresql:\/\/\S+/g,'[redacted]').slice(-1400));
 return text;
}
const before=baseline().filter(c=>c.project!==project),guard=await startDockerGuard(project);
const env={...process.env,DOCKER_HOST:guard.url.replace('http:','tcp:'),DOCKER_CONTEXT:'',SUPABASE_ACCESS_TOKEN:'',RESEND_API_KEY:'',DO_NOT_TRACK:'1'};
try{
 const version=(await cli(['--version'],env)).trim();if(version!=='2.120.0')throw new Error('Required local CLI version is 2.120.0');
 const published=baseline().filter(c=>c.project===project&&c.state==='running').flatMap(c=>Object.values(c.ports??{}).flat().map(p=>Number(p.HostPort)));
 for(const port of [54320,54321,54322,54323,54324])if(!published.includes(port))await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',()=>reject(new Error('Local port occupied: '+port)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
 const directory=resolve(workdir,'supabase'),destination=resolve(directory,'migrations');mkdirSync(destination,{recursive:true});
 if(existsSync(resolve(directory,'.temp/project-ref')))throw new Error('Linked metadata forbidden in local workspace');
 copyFileSync(resolve(root,'supabase/local/config.toml'),resolve(directory,'config.toml'));
 copyFileSync(resolve(root,'supabase/seed.sql'),resolve(directory,'seed.sql'));
 cpSync(resolve(root,'supabase/functions'),resolve(directory,'functions'),{recursive:true,filter:path=>!/(^|[\\/])\.env($|\.)/.test(path)});
 const migrations=readdirSync(resolve(root,'supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
 const existing=await dockerRequest('GET','/containers/supabase_db_lume-house/json'),fresh=existing.status===404;
 if(!fresh){
  const db=JSON.parse(existing.body);
  if(db.Config.Labels?.['com.supabase.cli.project']!==project||db.HostConfig.PortBindings['5432/tcp']?.[0]?.HostPort!=='54322'||db.HostConfig.PortBindings['5432/tcp']?.[0]?.HostIp!=='127.0.0.1')throw new Error('Local database ownership/port mismatch');
 }
 if(fresh){for(const name of readdirSync(destination)){if(!migrations.includes(name))throw new Error('Unexpected generated migration; inspect');if(!migrations.slice(0,4).includes(name))unlinkSync(resolve(destination,name));}}
 for(const container of baseline().filter(c=>c.project===project&&c.state==='exited').sort((a,b)=>Number(b.name.includes('_db_'))-Number(a.name.includes('_db_'))))execFileSync('docker',['start',container.id],{stdio:'ignore',env:localDockerEnv});
 for(const name of migrations.slice(0,4))copyFileSync(resolve(root,'supabase/migrations',name),resolve(destination,name));
 console.log('Starting guarded LOCAL Supabase: 00100–00400 then reviewed seed.');
 await cli(['start','--exclude','edge-runtime,logflare,vector,realtime,storage-api,imgproxy,supavisor'],env);
 const db=await dockerRequest('GET','/containers/supabase_db_lume-house/json'),info=JSON.parse(db.body);
 if(info.Config.Labels?.['com.supabase.cli.project']!==project||info.HostConfig.PortBindings['5432/tcp']?.[0]?.HostPort!=='54322')throw new Error('LOCAL database target not proven');
 const sql=statement=>execFileSync('docker',['exec','-i','supabase_db_lume-house','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:statement,encoding:'utf8',env:localDockerEnv}).trim();
 const history=sql('select version from supabase_migrations.schema_migrations order by version;').split(/\s+/);
 if(history.length===4&&history[3]==='20261002000400'){
  const count=sql('select count(*) from public.products;');
  if(count==='0'){
   console.log('Confirmed local 00400 boundary and empty catalogue; loading reviewed repository seed transactionally.');
   sql('begin;\n'+readFileSync(resolve(root,'supabase/seed.sql'),'utf8')+'\ncommit;');
  }else if(count!=='20')throw new Error('Unexpected catalogue at local bootstrap boundary; inspect before continuing');
 }
 for(const name of migrations){const source=resolve(root,'supabase/migrations',name),target=resolve(destination,name);copyFileSync(source,target);if(createHash('sha256').update(readFileSync(source)).digest('hex')!==createHash('sha256').update(readFileSync(target)).digest('hex'))throw new Error('Migration copy mismatch');}
 console.log('Verified local DB 54322; continuing unchanged 00500–01800 with --local.');
 await cli(['migration','up','--local'],env);
 if(JSON.stringify(before)!==JSON.stringify(baseline().filter(c=>c.project!==project)))throw new Error('Unrelated container baseline changed');
 console.log('LOCAL_STACK_READY; unrelated baseline unchanged; prune blocked.');
}finally{await guard.close();}
