import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
let server,AdminPage,AuthContext,checkAdmin;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});({AdminPage}=await server.ssrLoadModule('/src/features/admin/AdminPage.tsx'));({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));({checkAdmin}=await server.ssrLoadModule('/src/features/admin/adminRepository.ts'));});
after(async()=>{await server?.close();});
test('variant editor preserves default identity and requires explicit real options',async()=>{
 const {VariantEditor}=await server.ssrLoadModule('/src/features/admin/VariantManager.tsx');
 const render=variant=>renderToStaticMarkup(React.createElement(VariantEditor,{variant,productId:'local',token:'local-token',saved:()=>{}}));
 assert.match(render(null),/Options \(JSON object\)/);assert.match(render(null),/Do not invent default options/);
 const html=render({id:'default:local',is_default:true,sku:'DEFAULT-local',options:{},price_cents:200,active:false});
 assert.doesNotMatch(html,/name="options"/);assert.match(html,/readOnly=""/);assert.match(html,/Currency is NLE/);
});
test('product editor labels editorial inputs separately from initial variant price',async()=>{
 const {ProductEditor}=await server.ssrLoadModule('/src/features/admin/ProductManager.tsx');
 const render=product=>renderToStaticMarkup(React.createElement(ProductEditor,{product,token:'local-token',saved:()=>{}}));
 assert.match(render(null),/Initial default variant price/);assert.match(render(null),/name="description"/);
 const product={id:'fixture',name:'Local',description:'Description',category:'Test',image_path:'/images/mug.svg',background_color:'#e9e3d8',display_order:0,active:false,updated_at:'2026-10-06'};
 assert.doesNotMatch(render(product),/name="initial_price"/);assert.match(render(product),/Existing orders keep/);
});
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
