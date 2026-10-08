import http from 'node:http';
const socketPath = '\\\\.\\pipe\\dockerDesktopLinuxEngine';
export const localDockerEnv = {
  ...process.env,
  DOCKER_HOST: 'npipe:////./pipe/dockerDesktopLinuxEngine',
  DOCKER_CONTEXT: '',
};
export function dockerRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({socketPath, method, path, headers: body ? {'Content-Type':'application/json'} : {}}, response => {
      const chunks=[]; response.on('data', chunk=>chunks.push(chunk));
      response.on('end',()=>resolve({status:response.statusCode, body:Buffer.concat(chunks)}));
    });
    request.on('error',reject); request.end(body);
  });
}
// Process-local CLI transport. No Docker Desktop setting is changed.
// All prune requests and unrelated-resource writes fail before reaching Docker.
export async function startDockerGuard(project, inspect = dockerRequest) {
  const owned=async(kind,id)=>{
    const path=['volumes','networks'].includes(kind)?`/${kind}/${id}`:`/${kind}/${id}/json`;
    const result=await inspect('GET',path);if(result.status!==200)return false;
    const value=JSON.parse(result.body);
    if(kind==='exec')return owned('containers',value.ContainerID);
    return (value.Config?.Labels??value.Labels)?.['com.supabase.cli.project']===project;
  };
  const allowed=async(request,body)=>{
    if(request.headers.origin)return false;
    const parsed=new URL(request.url,'http://localhost'),path=parsed.pathname.replace(/^\/v[\d.]+/,'');
    if(path.endsWith('/prune'))return false;
    if(['GET','HEAD'].includes(request.method))return true;
    let value={};
    if(['/containers/create','/networks/create','/volumes/create'].includes(path)){try{value=body.length?JSON.parse(body):{};}catch{return false;}}
    if(request.method==='POST'&&path==='/containers/create'){
      if(value.Labels?.['com.supabase.cli.project']!==project)return false;
      if(!parsed.searchParams.get('name')?.startsWith('supabase_')||!parsed.searchParams.get('name')?.endsWith('_'+project))return false;
      if(value.HostConfig?.NetworkMode!==`supabase_network_${project}`)return false;
      if(value.Env?.some(entry=>entry.startsWith('RESEND_API_KEY=')&&entry!=='RESEND_API_KEY='))return false;
      const ports=Object.values(value.HostConfig?.PortBindings??{}).flat();
      if(ports.some(port=>![54321,54322,54323,54324,8083].includes(Number(port.HostPort))))return false;
      for(const port of ports)port.HostIp='127.0.0.1';
      request.guardedBody=Buffer.from(JSON.stringify(value));return true;
    }
    if(request.method==='POST'&&path==='/networks/create'){
      if(value.Name!==`supabase_network_${project}`||value.Labels?.['com.supabase.cli.project']!==project)return false;
      const existing=await inspect('GET','/networks/'+value.Name);return existing.status===404||await owned('networks',value.Name);
    }
    if(request.method==='POST'&&path==='/volumes/create'){
      if(!value.Name?.startsWith('supabase_')||!value.Name.endsWith('_'+project)||value.Labels?.['com.supabase.cli.project']!==project)return false;
      const existing=await inspect('GET','/volumes/'+value.Name);return existing.status===404||await owned('volumes',value.Name);
    }
    if(request.method==='POST'&&path==='/images/create')return /^(public\.ecr\.aws\/supabase\/|ghcr\.io\/supabase\/|supabase\/)/.test(parsed.searchParams.get('fromImage')??'');
    const match=path.match(/^\/(containers|networks|volumes|exec)\/([^/]+)/);
    return match?owned(match[1],decodeURIComponent(match[2])):false;
  };
  const server=http.createServer(async(request,response)=>{
    try{
      const chunks=[];let length=0;for await(const chunk of request){chunks.push(chunk);length+=chunk.length;if(length>4*1024*1024)throw new Error('oversize');}
      const body=Buffer.concat(chunks);
      const permitted=await allowed(request,body);
      console.log('DOCKER_GUARD '+(permitted?'ALLOW ':'DENY ')+request.method+' '+new URL(request.url,'http://localhost').pathname);
      if(!permitted){response.writeHead(403,{'Content-Type':'application/json'});response.end(JSON.stringify({message:'Local Docker guard denied operation'}));return;}
      const outgoing=request.guardedBody??body,headers={...request.headers};delete headers.host;delete headers['content-length'];delete headers['transfer-encoding'];
      if(outgoing.length)headers['content-length']=String(outgoing.length);
      const upstream=http.request({socketPath,method:request.method,path:request.url,headers},result=>{response.writeHead(result.statusCode,result.headers);result.pipe(response);});
      upstream.on('upgrade',(result,socket,head)=>{response.writeHead(result.statusCode,result.headers);response.flushHeaders();if(head.length)response.write(head);socket.pipe(response);response.on('close',()=>socket.destroy());});
      upstream.on('error',()=>{response.writeHead(502);response.end();});upstream.end(outgoing);
    }catch{response.writeHead(403);response.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${server.address().port}`;
  for(const path of ['/containers/prune','/volumes/prune','/networks/prune','/containers/mpp-local-main-postgres-db-1/stop']){
    const result=await fetch(url+path,{method:'POST'});
    if(result.status!==403){server.close();throw new Error('Docker guard verification failed');}
  }
  return {url,close:()=>new Promise(resolve=>server.close(resolve))};
}
