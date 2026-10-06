import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
let server,AdminPage,AuthContext,checkAdmin;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});({AdminPage}=await server.ssrLoadModule('/src/features/admin/AdminPage.tsx'));({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));({checkAdmin}=await server.ssrLoadModule('/src/features/admin/adminRepository.ts'));});
after(async()=>{await server?.close();});
test('signed-out admin renders account entry and never operational data',()=>{
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AuthContext.Provider,{value:{loading:false,session:null}},React.createElement(AdminPage))));
 assert.match(html,/authorized Google account/);assert.match(html,/href="\/account"/);assert.doesNotMatch(html,/Operational tools/);
});
test('admin loading avoids disclosure',()=>{
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AuthContext.Provider,{value:{loading:true,session:null}},React.createElement(AdminPage))));
 assert.match(html,/role="status"/);assert.match(html,/Restoring/);
});
test('membership check freezes bearer identity and fails closed',async()=>{
 let captured;const client={rpc:name=>({setHeader:async(k,v)=>{captured={name,k,v};return {data:false,error:null};}})};
 assert.equal(await checkAdmin(client,'local-token'),false);assert.deepEqual(captured,{name:'is_business_admin',k:'Authorization',v:'Bearer local-token'});
 await assert.rejects(checkAdmin({rpc:()=>({setHeader:async()=>({data:null,error:{code:'42501'}})})},'local-token'),/could not be checked/);
 await assert.rejects(checkAdmin({rpc:()=>({setHeader:async()=>({data:'true',error:null})})},'local-token'),/could not be checked/);
});
