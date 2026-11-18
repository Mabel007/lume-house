import {createServer as viteServer} from 'vite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
export async function createServer(options={}) {
  const parent=resolve(tmpdir());
  const cacheDir=mkdtempSync(join(parent,'lume-vite-test-'));
  const cleanup=()=>{
    if(dirname(resolve(cacheDir))!==parent || !basename(cacheDir).startsWith('lume-vite-test-')) throw new Error('Unexpected test cache path');
    rmSync(cacheDir,{recursive:true,force:true});
  };
  try {
    const server=await viteServer({...options,cacheDir,server:{...options.server,hmr:false,ws:false}});
    const close=server.close.bind(server);
    let closing;
    server.close=()=>closing??=(async()=>{try{await close();}finally{cleanup();}})();
    return server;
  } catch(error) {cleanup();throw error;}
}
