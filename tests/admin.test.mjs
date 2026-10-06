import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
let server,AdminPage,AuthContext,checkAdmin;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});({AdminPage}=await server.ssrLoadModule('/src/features/admin/AdminPage.tsx'));({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));({checkAdmin}=await server.ssrLoadModule('/src/features/admin/adminRepository.ts'));});
after(async()=>{await server?.close();});
test('admin title and editor heading support useful focus context',async()=>{
 const {routeTitle}=await server.ssrLoadModule('/src/config/routeExperience.ts');
 assert.equal(routeTitle('/admin/products'),'Administration');
 const {ProductEditor}=await server.ssrLoadModule('/src/features/admin/ProductManager.tsx');
 const html=renderToStaticMarkup(React.createElement(ProductEditor,{product:null,token:'local-token',saved:()=>{}}));
 assert.match(html,/<h3 tabindex="-1">Create product/);
});
test('operational transitions are mode-specific and terminal-protected',async()=>{
 const {nextOperationalStatuses:next}=await server.ssrLoadModule('/src/features/admin/orderOperations.ts');
 assert.deepEqual(next('placed','pickup'),['confirmed','cancelled']);assert.deepEqual(next('confirmed','delivery'),['processing','cancelled']);
 assert.deepEqual(next('processing','pickup'),['ready_for_pickup']);assert.deepEqual(next('processing','delivery'),['out_for_delivery']);
 assert.deepEqual(next('completed','pickup'),[]);assert.deepEqual(next('cancelled','delivery'),[]);assert.deepEqual(next('ready_for_pickup','delivery'),[]);
});
test('order operations preserve payment distinction and do not offer paid controls',async()=>{
 const {OrderOperations}=await server.ssrLoadModule('/src/features/admin/OrderManager.tsx');
 const html=renderToStaticMarkup(React.createElement(OrderOperations,{order:{status:'placed',fulfilment_method:'pickup'},token:'local-token',saved:()=>{}}));
 assert.match(html,/Operational status is separate from payment/);assert.match(html,/Cancellation does not issue a refund/);assert.doesNotMatch(html,/value="paid"/);assert.match(html,/name="reason"/);
 const terminal=renderToStaticMarkup(React.createElement(OrderOperations,{order:{status:'completed',fulfilment_method:'pickup'},token:'local-token',saved:()=>{}}));
 assert.match(terminal,/No further operational transitions/);assert.doesNotMatch(terminal,/<form/);
});
test('inventory editor labels actual adjustment and never implies invented stock',async()=>{
 const {InventoryEditor}=await server.ssrLoadModule('/src/features/admin/InventoryManager.tsx');
 const html=renderToStaticMarkup(React.createElement(InventoryEditor,{row:{variant_id:'local',product_name:'Local',sku:'LOCAL',inventory_policy:'untracked',on_hand:null,allocated:null},token:'local-token',saved:()=>{}}));
 assert.match(html,/Not configured/);assert.match(html,/Quantity change \(integer\)/);assert.match(html,/name="reason"/);assert.match(html,/Allocated stock must stay tracked/);assert.doesNotMatch(html,/Only \d+ left/);
});
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
