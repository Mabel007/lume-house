import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startDockerGuard} from '../supabase/local/docker-guard.mjs';
test('local transport blocks prune, foreign writes, nonlocal ports and email secrets',async()=>{
 const guard=await startDockerGuard('lume-house',async()=>({status:200,body:JSON.stringify({Config:{Labels:{'com.supabase.cli.project':'other-project'}}})}));
 try{
  for(const path of ['/containers/prune','/v1.55/networks/prune','/volumes/prune','/containers/foreign/restart'])assert.equal((await fetch(guard.url+path,{method:'POST'})).status,403);
  const base={Labels:{'com.supabase.cli.project':'lume-house'},HostConfig:{NetworkMode:'supabase_network_lume-house'}};
  for(const value of [{...base,Labels:{'com.supabase.cli.project':'other-project'}},{...base,HostConfig:{...base.HostConfig,PortBindings:{'5432/tcp':[{HostPort:'5432'}]}}},{...base,Env:['RESEND_API_KEY=synthetic-test-only']},{...base,HostConfig:{NetworkMode:'other-project'}}])assert.equal((await fetch(guard.url+'/containers/create?name=supabase_test_lume-house',{method:'POST',body:JSON.stringify(value)})).status,403);
  for(const [path,Name] of [['/volumes/create','supabase_db_lume-house'],['/networks/create','supabase_network_lume-house']])assert.equal((await fetch(guard.url+path,{method:'POST',body:JSON.stringify({Name,Labels:{'com.supabase.cli.project':'lume-house'}})})).status,403);
 }finally{await guard.close();}
});
