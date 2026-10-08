import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createServer as createPortProbe} from 'node:net';
import {createClient} from '@supabase/supabase-js';
import {localDockerEnv} from './docker-guard.mjs';
const args=['status','--workdir','.codex/local-stack','-o','json'];
const cli=process.env.LOCAL_SUPABASE_CLI?spawn(process.env.LOCAL_SUPABASE_CLI,args,{windowsHide:true}):spawn('npx.cmd',['--yes','supabase@2.120.0',...args],{shell:true,windowsHide:true});
let output='';cli.stdout.on('data',chunk=>output+=chunk);cli.stderr.resume();
if(await new Promise(resolve=>cli.on('exit',resolve))!==0)throw new Error('Start the local stack first');
const status=JSON.parse(output);
if(status.API_URL!=='http://127.0.0.1:54321'||!status.PUBLISHABLE_KEY?.startsWith('sb_publishable_'))throw new Error('Local public configuration required');
const db=JSON.parse(execFileSync('docker',['inspect','supabase_db_lume-house'],{encoding:'utf8',env:localDockerEnv}))[0];
if(db.Config.Labels?.['com.supabase.cli.project']!=='lume-house'||db.HostConfig.PortBindings['5432/tcp'][0].HostPort!=='54322')throw new Error('Local database ownership required');
for(const port of [5188,5190])await new Promise((resolve,reject)=>{const probe=createPortProbe();probe.once('error',()=>reject(new Error('Local frontend/helper port occupied: '+port)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
const users={},makeClient=()=>createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
for(const role of ['customer-a','customer-b','admin-a','admin-b']){
 const email=`${role}-${randomUUID()}@lume-local.example.invalid`,password=randomUUID()+randomUUID(),client=makeClient();
 const result=await client.auth.signUp({email,password});if(result.error||!result.data.user)throw new Error('Local synthetic Auth creation failed');
 users[role]={email,password};
 if(role.startsWith('admin'))execFileSync('docker',['exec','-i','supabase_db_lume-house','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:`set role service_role;select public.set_business_admin('${result.data.user.id}',true,'LOCAL QA privileged bootstrap');`,stdio:['pipe','ignore','pipe'],env:localDockerEnv});
}
const server=createServer(async(req,res)=>{
 if(req.headers.origin!=='http://127.0.0.1:5188'){res.writeHead(403);res.end();return;}
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5188');res.setHeader('Access-Control-Allow-Headers','content-type');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 if(req.method==='GET'&&req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({project:'lume-house',purpose:'local-qa'}));return;}
 if(req.method==='POST'&&req.url==='/shutdown'){res.writeHead(204);res.end();frontend.kill();server.close();return;}
 if(req.method!=='POST'||req.url!=='/session'){res.writeHead(404);res.end();return;}
 try{let body='';for await(const chunk of req){body+=chunk;if(body.length>200)throw new Error();}const user=users[JSON.parse(body).role];if(!user)throw new Error();const result=await makeClient().auth.signInWithPassword(user);if(result.error)throw new Error();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({access_token:result.data.session.access_token,refresh_token:result.data.session.refresh_token}));}catch{res.writeHead(400);res.end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(5190,'127.0.0.1',resolve);});
const frontend=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5188','--strictPort'],{windowsHide:true,env:{...process.env,NODE_ENV:'development',VITE_SUPABASE_URL:status.API_URL,VITE_SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY,VITE_AUTH_REDIRECT_URL:'http://127.0.0.1:5188/auth/callback'}});
frontend.stdout.pipe(process.stdout);frontend.stderr.pipe(process.stderr);
frontend.on('exit',()=>server.close());process.on('SIGINT',()=>{frontend.kill();server.close();});
console.log('LOCAL QA sign-in: http://127.0.0.1:5188/supabase/local/auth.html');
