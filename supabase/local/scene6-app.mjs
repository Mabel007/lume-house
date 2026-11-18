import {execFileSync,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
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

const TARGET_USER_ID = 'f65d8e59-71a1-40af-9550-a4ba38f320a2';
const TARGET_EMAIL = 'customer-a-de8aec64@lume-local.example.invalid';
const PASSWORD = randomBytes(24).toString('base64url').slice(0, 32);

console.log('=== Scene 6 Auth Helper (Modified app.mjs) ===\n');
console.log('Target:', TARGET_EMAIL);
console.log('Password: [generated in memory]');

const adminClient = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const { error } = await adminClient.auth.admin.updateUserById(TARGET_USER_ID, { password: PASSWORD });
if (error) {
  console.error('❌ Password reset failed:', error.message);
  process.exit(1);
}
console.log('✓ Password reset successful\n');

const users = { 'customer-a': { email: TARGET_EMAIL, password: PASSWORD } };
const makeClient=()=>createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const server=createServer(async(req,res)=>{
  if(req.headers.origin!=='http://127.0.0.1:5188'){res.writeHead(403);res.end();return;}
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5188');
  res.setHeader('Access-Control-Allow-Headers','content-type');
  res.setHeader('Cache-Control','no-store');
  
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method==='GET'&&req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({project:'lume-house',purpose:'scene6-qa'}));return;}
  if(req.method==='POST'&&req.url==='/shutdown'){res.writeHead(204);res.end();frontend.kill();server.close();return;}
  if(req.method!=='POST'||req.url!=='/session'){res.writeHead(404);res.end();return;}
  
  try{
    let body='';
    for await(const chunk of req){
      body+=chunk;
      if(body.length>200)throw new Error();
    }
    const user=users[JSON.parse(body).role];
    if(!user)throw new Error('Unknown role');
    
    const result=await makeClient().auth.signInWithPassword(user);
    if(result.error)throw new Error(result.error.message);
    
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({
      access_token:result.data.session.access_token,
      refresh_token:result.data.session.refresh_token
    }));
  }catch(err){
    console.error('Session error:', err.message);
    res.writeHead(400);
    res.end();
  }
});

await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(5190,'127.0.0.1',resolve);});

const frontend=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5188','--strictPort'],{
  windowsHide:true,
  env:{
    ...process.env,
    NODE_ENV:'development',
    VITE_SUPABASE_URL:status.API_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY,
    VITE_AUTH_REDIRECT_URL:'http://127.0.0.1:5188/auth/callback'
  }
});

frontend.stdout.pipe(process.stdout);
frontend.stderr.pipe(process.stderr);
frontend.on('exit',()=>server.close());
process.on('SIGINT',()=>{frontend.kill();server.close();});

console.log('✓ Auth helper running on http://127.0.0.1:5190');
console.log('✓ Dev server starting on http://127.0.0.1:5188');
console.log('✓ LOCAL QA sign-in: http://127.0.0.1:5188/supabase/local/auth.html');
console.log('\nPress Ctrl+C to stop.\n');
