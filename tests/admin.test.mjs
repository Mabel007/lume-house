import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
let server,AdminPage,AuthContext,checkAdmin;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});({AdminPage}=await server.ssrLoadModule('/src/features/admin/AdminPage.tsx'));({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));({checkAdmin}=await server.ssrLoadModule('/src/features/admin/adminRepository.ts'));});
after(async()=>{await server?.close();});
test('admin title and editor heading support useful focus context',async()=>{
 const {routeTitle}=await server.ssrLoadModule('/src/config/routeExperience.ts');
 assert.equal(routeTitle('/admin/products'),'Catalogue | Administration');
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
 assert.match(render(null),/Variant options/);assert.match(render(null),/Add option/);assert.match(render(null),/Do not invent default options/);
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

test('structured options round trip, trim and reject malformed rows',async()=>{
 const {optionRows,serializeOptions}=await server.ssrLoadModule('/src/features/admin/variantOptions.ts');
 assert.deepEqual(serializeOptions([]),{});
 assert.deepEqual(serializeOptions([{id:1,name:' Size ',value:' Large '},{id:2,name:'Color',value:'Cream'}]),{Color:'Cream',Size:'Large'});
 assert.deepEqual(serializeOptions(optionRows({Color:'Cream',Size:'Large'})),{Color:'Cream',Size:'Large'});
 for(const rows of [[{id:0,name:'',value:'x'}],[{id:0,name:'Color',value:''}],[{id:0,name:'Color',value:'x'},{id:1,name:' Color ',value:'y'}]]) assert.throws(()=>serializeOptions(rows));
 assert.throws(()=>optionRows({Color:123}));assert.throws(()=>optionRows({Color:' Cream '}));assert.throws(()=>optionRows([]));
});
test('structured existing options have labeled controls and removal',async()=>{
 const {VariantEditor}=await server.ssrLoadModule('/src/features/admin/VariantManager.tsx');
 const html=renderToStaticMarkup(React.createElement(VariantEditor,{variant:{options:{Color:'Cream',Size:'Large'},sku:'LOCAL',price_cents:100},productId:'local',token:'local',saved:()=>{}}));
 assert.match(html,/Option 1 name/);assert.match(html,/value="Cream"/);assert.match(html,/Remove option 2/);assert.doesNotMatch(html,/textarea/);
});

test('media foundation states its actual capability without pretending uploads',async()=>{
 const {ProductMedia}=await server.ssrLoadModule('/src/features/admin/ProductMedia.tsx');
 const html=renderToStaticMarkup(React.createElement(ProductMedia,{product:{id:'local',name:'Local',image_path:'/images/mug.svg'},token:'local',saved:()=>{}}));
 assert.match(html,/Product media/);assert.match(html,/Uploads and galleries are not available yet/);assert.match(html,/Loading reviewed media/);assert.doesNotMatch(html,/type="file"/);
});

test('membership UI preserves service bootstrap boundary',async()=>{
 const {MembershipManager}=await server.ssrLoadModule('/src/features/admin/MembershipManager.tsx');
 const html=renderToStaticMarkup(React.createElement(MembershipManager,{token:'local'}));
 assert.match(html,/service-only operations/);assert.match(html,/Self-revocation is disabled/);assert.match(html,/Loading memberships/);assert.doesNotMatch(html,/Invite by email/);
});

test('cancellation copy preserves request and refund boundaries',async()=>{
 const {CancellationRequest,CancellationStatus}=await server.ssrLoadModule('/src/features/orders/CancellationRequest.tsx');
 const {parseCancellation}=await server.ssrLoadModule('/src/features/orders/cancellation.ts');
 const html=renderToStaticMarkup(React.createElement(CancellationRequest,{orderId:'local',status:'placed',token:'local'}));
 assert.match(html,/<h2 tabindex="-1">Cancellation request/);assert.match(html,/not immediate cancellation/);assert.match(html,/confirmation is required/);assert.match(html,/does not issue a refund/);
 const request={order_id:'local',reason:'Changed plans',requested_at:'2026-10-06T00:00:00Z',status:'pending',resolution:null};
 assert.deepEqual(parseCancellation(request),request);assert.equal(parseCancellation(null),null);assert.throws(()=>parseCancellation({status:'refunded'}));
 const pending=renderToStaticMarkup(React.createElement(CancellationStatus,{request}));assert.match(pending,/pending/);assert.match(pending,/Changed plans/);assert.doesNotMatch(pending,/Payment successful/);
});

test('scoped workspace preserves routes, contextual headings and one active navigation link',async()=>{
 const {AdminWorkspace}=await server.ssrLoadModule('/src/features/admin/AdminWorkspace.tsx');
 const {adminNavigation}=await server.ssrLoadModule('/src/config/adminNavigation.ts');
 const {routeTitle}=await server.ssrLoadModule('/src/config/routeExperience.ts');
 for(const item of adminNavigation){
  const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[item.path]},React.createElement(AuthContext.Provider,{value:{session:{user:{email:'admin-a@local.example.invalid'}},signOut:async()=>{},error:null}},React.createElement(Routes,null,React.createElement(Route,{path:'/admin/*',element:React.createElement(AdminWorkspace,{token:'local-component-token'})})))));
  assert.match(html,new RegExp(`<h1>${item.title}</h1>`));
  assert.equal((html.match(/<h1[ >]/g)??[]).length,1);
  const nav=html.match(/<nav[^>]*aria-label="Business administration"[^>]*>(.*?)<\/nav>/s)[1];
  assert.equal((nav.match(/<a /g)??[]).length,5);
  const active=nav.match(/<a[^>]*aria-current="page"[^>]*>/g)??[];
  assert.equal(active.length,1);assert.ok(active[0].includes(`href="${item.path}"`));
  assert.equal(routeTitle(item.path),`${item.title} | Administration`);
  assert.equal(routeTitle(item.path+'/'),`${item.title} | Administration`);
  assert.match(html,/Sign Out/);assert.match(html,/admin-a@local.example.invalid/);
 }
});
test('unknown admin route has contextual recovery and preserves sign-out error feedback',async()=>{
 const {AdminWorkspace}=await server.ssrLoadModule('/src/features/admin/AdminWorkspace.tsx');
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:['/admin/missing']},React.createElement(AuthContext.Provider,{value:{session:{user:{email:'admin-a@local.example.invalid'}},signOut:async()=>{},error:'Sign-out failed. Please try again.'}},React.createElement(Routes,null,React.createElement(Route,{path:'/admin/*',element:React.createElement(AdminWorkspace,{token:'local-component-token'})})))));
 assert.match(html,/<h1>Administration page not found<\/h1>/);assert.match(html,/Back to Overview/);assert.match(html,/role="alert"[^>]*>Sign-out failed/);
 assert.doesNotMatch(html,/aria-current="page"/);
});
test('authenticated admin gate exposes no workspace before membership check completes',()=>{
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:['/admin/orders']},React.createElement(AuthContext.Provider,{value:{loading:false,session:{user:{id:'synthetic-local-id'},access_token:'local-component-token'}}},React.createElement(AdminPage))));
 assert.match(html,/Checking administration access/);assert.match(html,/View Storefront/);
 assert.doesNotMatch(html,/admin-navigation|Sign Out|Loading orders/);
 assert.equal((html.match(/<h1[ >]/g)??[]).length,1);
});

test('admin order list validates permitted customer name without broadening customer parser',async()=>{
 const {parseAdminOrderList}=await server.ssrLoadModule('/src/features/admin/adminOrders.ts');
 const {parseOrderList}=await server.ssrLoadModule('/src/features/orders/orders.ts');
 const row={id:'11111111-1111-4111-8111-111111111111',order_reference:'LH-AAAAAAAAAAAAAAAA',created_at:'2026-10-08T12:00:00Z',total_cents:12000,currency:'NLE',fulfilment_method:'pickup',status:'placed',payment_status:'awaiting_payment',full_name:'Synthetic Customer',customer_email:'not-listed@example.invalid'};
 const parsed=parseAdminOrderList(row);assert.equal(parsed.full_name,'Synthetic Customer');assert.equal(parsed.customer_email,undefined);assert.equal(parseOrderList(row).full_name,undefined);
 assert.throws(()=>parseAdminOrderList({...row,full_name:null}));assert.throws(()=>parseAdminOrderList({...row,total_cents:-1}));
 const {AdminOrderList}=await server.ssrLoadModule('/src/features/admin/OrderManager.tsx');
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AdminOrderList,{orders:[parsed],search:'?query=Synthetic&status=placed'})));
 assert.match(html,/href="\/admin\/orders\/11111111-1111-4111-8111-111111111111\?query=Synthetic&amp;status=placed"/);
 for(const label of ['Synthetic Customer','Fulfilment','Pickup','Operational status','Payment status','Awaiting confirmation','Total'])assert.ok(html.includes(label));
 assert.match(html,/<time dateTime="2026-10-08T12:00:00Z"/);assert.doesNotMatch(html,/not-listed@example|mark-paid|Refund/);
});
test('order filter URLs retain list intent through detail, direct reload and return',async()=>{
 const {orderFilters,orderDetailUrl,orderListUrl}=await server.ssrLoadModule('/src/features/admin/adminOrders.ts');
 const search='?query=Local%20Test&status=processing&return=https%3A%2F%2Fexample.invalid';
 assert.deepEqual(orderFilters(search),{query:'Local Test',status:'processing'});
 const detail=orderDetailUrl('11111111-1111-4111-8111-111111111111',search);
 assert.equal(orderListUrl(detail.slice(detail.indexOf('?'))),'/admin/orders?query=Local+Test&status=processing');
 assert.deepEqual(orderFilters('?status=paid'),{query:'',status:''});assert.equal(orderFilters('?query='+ 'x'.repeat(250)).query.length,200);
 assert.equal(orderListUrl(''),'/admin/orders');
});
test('deep order route renders protected workspace, active Orders and safe loading/back context',async()=>{
 const {AdminWorkspace}=await server.ssrLoadModule('/src/features/admin/AdminWorkspace.tsx');const {routeTitle}=await server.ssrLoadModule('/src/config/routeExperience.ts');
 const path='/admin/orders/11111111-1111-4111-8111-111111111111';
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[path+'?status=placed']},React.createElement(AuthContext.Provider,{value:{session:{user:{email:'admin@local.example.invalid'}},signOut:async()=>{},error:null}},React.createElement(Routes,null,React.createElement(Route,{path:'/admin/*',element:React.createElement(AdminWorkspace,{token:'synthetic-token'})})))));
 assert.match(html,/<h1>Orders<\/h1>/);assert.equal((html.match(/aria-current="page"/g)??[]).length,1);assert.match(html,/Loading order details/);assert.match(html,/href="\/admin\/orders\?status=placed"/);assert.equal(routeTitle(path),'Orders | Administration');
 const gated=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(AuthContext.Provider,{value:{loading:false,session:null}},React.createElement(AdminPage))));
 assert.doesNotMatch(gated,/Loading order details|admin-order-detail/);assert.match(gated,/authorized Google account/);
});
test('guarded detail reads freeze JWT and classify missing, denied and transport errors safely',async()=>{
 const {loadAdminOrder}=await server.ssrLoadModule('/src/features/admin/adminOrders.ts');const id='11111111-1111-4111-8111-111111111111';let captured;
 const client=error=>({rpc:(name,args)=>({setHeader:async(key,value)=>{captured={name,args,key,value};return {data:null,error};}})});
 for(const [error,kind] of [[{code:'42501'},'denied'],[{code:'22023',message:'ORDER_NOT_FOUND'},'missing'],[{code:'22023',message:'other private text'},'error'],[null,'missing']])await assert.rejects(loadAdminOrder(client(error),'synthetic-jwt',id),cause=>cause.kind===kind&&!cause.message.includes('private'));
 assert.deepEqual(captured,{name:'admin_get_order',args:{p_order_id:id},key:'Authorization',value:'Bearer synthetic-jwt'});
 let called=false;await assert.rejects(loadAdminOrder({rpc:()=>{called=true;}},'token','invalid'),cause=>cause.kind==='missing');assert.equal(called,false);
});
test('detail states distinguish loading, missing, denial and safe read retry',async()=>{
 const {AdminOrderDetailState}=await server.ssrLoadModule('/src/features/admin/OrderManager.tsx');
 const render=status=>renderToStaticMarkup(React.createElement(AdminOrderDetailState,{state:{status},token:'synthetic',saved(){},retry(){}}));
 assert.match(render('loading'),/role="status".*Loading order details/);assert.match(render('missing'),/Order not found/);assert.match(render('denied'),/role="alert".*Administration access was denied/);assert.match(render('denied'),/Retry loading order/);assert.match(render('error'),/Retry loading order/);
});
test('ready admin detail preserves snapshot, cancellation and operation content with awaiting payment',async()=>{
 const {AdminOrderDetailState}=await server.ssrLoadModule('/src/features/admin/OrderManager.tsx');const {loadAdminOrder}=await server.ssrLoadModule('/src/features/admin/adminOrders.ts');
 const fixture={id:'11111111-1111-4111-8111-111111111111',order_reference:'LH-AAAAAAAAAAAAAAAA',created_at:'2026-10-08T12:00:00Z',total_cents:12000,currency:'NLE',fulfilment_method:'pickup',status:'placed',payment_status:'awaiting_payment',full_name:'Synthetic Customer',customer_email:'customer@local.example.invalid',customer_phone:'+23276521208',delivery_street_address:null,delivery_area:null,delivery_city:null,delivery_zone_label:null,delivery_instructions:null,pickup_location:'Lumley',payment_provider:'orange',payment_phone_last4:'1208',subtotal_cents:12000,delivery_fee_cents:0,order_items:[{product_name:'LOCAL TEST item',quantity:2,unit_price_cents:6000}]};
 const order=await loadAdminOrder({rpc:()=>({setHeader:async()=>({data:fixture,error:null})})},'synthetic-jwt',fixture.id);
 const html=renderToStaticMarkup(React.createElement(AdminOrderDetailState,{state:{status:'ready',order,history:[]},token:'synthetic',saved(){},retry(){}}));
 for(const content of ['LH-AAAAAAAAAAAAAAAA','LOCAL TEST item','Payment: Awaiting confirmation','Cancellation request','Order operations','Operational history','name="reason"'])assert.ok(html.includes(content));
 assert.doesNotMatch(html,/value="paid"|Mark paid|Refund payment/);assert.equal(order.payment_status,'awaiting_payment');
});
test('filter structure preserves labels and URL-backed values with scoped grid alignment',async()=>{
 const {OrderManager}=await server.ssrLoadModule('/src/features/admin/OrderManager.tsx');
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:['/admin/orders?query=LOCAL&status=confirmed']},React.createElement(OrderManager,{token:'synthetic'})));
 assert.match(html,/<form class="admin-order-filters"/);assert.match(html,/<label>Search reference, customer name or email<input[^>]*value="LOCAL"/);assert.match(html,/value="confirmed" selected=""/);assert.match(html,/<button class="button">Apply filters<\/button>/);
 const css=readFileSync('src/features/admin/admin.css','utf8');assert.match(css,/\.admin-order-filters \{ display: grid;[^}]*align-items: end/);assert.match(css,/\.admin-workspace \.admin-order-filters label \{ margin: 0/);assert.match(css,/@media \(max-width: 850px\)[^\n]*grid-template-columns: minmax\(0, 1fr\)[^\n]*width: 100%/);assert.match(css,/\.admin-page \{ font-size: 1rem/);assert.match(css,/\.admin-screen \.status-pill[^}]*font-size: \.875rem/);
});
test('operational timeline sorts existing events chronologically without fabricating activity',async()=>{
 const {OrderTimeline}=await server.ssrLoadModule('/src/features/admin/OrderTimeline.tsx');
 const events=[{operation_id:'later',from_status:'confirmed',to_status:'processing',reason:'LOCAL TEST later',created_at:'2026-10-08T12:00:00Z'},{operation_id:'earlier',from_status:'placed',to_status:'confirmed',reason:'LOCAL TEST earlier',created_at:'2026-10-08T10:00:00Z'}];
 const render=state=>renderToStaticMarkup(React.createElement(OrderTimeline,{state,retry(){}}));const html=render({status:'ready',events});assert.ok(html.indexOf('LOCAL TEST earlier')<html.indexOf('LOCAL TEST later'));assert.equal(events[0].operation_id,'later');assert.match(html,/<ol class="order-activity"/);assert.match(html,/<time dateTime="2026-10-08T10:00:00Z"/);assert.match(html,/100 most recent/);assert.doesNotMatch(html,/Admin A|Payment verified|Order created/);
 assert.match(render({status:'loading'}),/role="status".*Loading operational history/);assert.match(render({status:'error'}),/role="alert".*Retry history/);assert.match(render({status:'ready',events:[]}),/No recorded operational transitions/);
});
test('cancellation timeline validates resolution dates and retains customer-visible rejection without actor leakage',async()=>{
 const {parseCancellation}=await server.ssrLoadModule('/src/features/orders/cancellation.ts');const {CancellationStatus}=await server.ssrLoadModule('/src/features/orders/CancellationRequest.tsx');
 const base={order_id:'local',reason:'LOCAL TEST request',requested_at:'2026-10-08T10:00:00Z',status:'rejected',resolution:'LOCAL TEST customer-visible reason',resolved_at:'2026-10-08T11:00:00Z',resolved_by:'private-actor',user_id:'private-owner'};
 const parsed=parseCancellation(base);assert.equal(parsed.resolved_at,base.resolved_at);assert.equal(parsed.resolved_by,undefined);assert.equal(parsed.user_id,undefined);
 const html=renderToStaticMarkup(React.createElement(CancellationStatus,{request:parsed}));for(const label of ['Customer requested cancellation','Request rejected','Customer-visible rejection reason','does not cancel the order or release stock'])assert.ok(html.includes(label));assert.match(html,/<time dateTime="2026-10-08T11:00:00Z"/);
 for(const resolved_at of ['not-a-date',7,{},null])assert.throws(()=>parseCancellation({...base,resolved_at}));assert.throws(()=>parseCancellation({...base,requested_at:'bad'}));assert.throws(()=>parseCancellation({...base,status:'pending'}));
 const legacy=parseCancellation({...base,resolved_at:undefined});const legacyHtml=renderToStaticMarkup(React.createElement(CancellationStatus,{request:legacy}));assert.match(legacyHtml,/Resolution time is not available/);assert.doesNotMatch(legacyHtml,/11:00:00Z/);
 for(const [status,label] of [['accepted','Order cancelled'],['closed','Request closed']])assert.ok(renderToStaticMarkup(React.createElement(CancellationStatus,{request:{...parsed,status}})).includes(label));
});
test('catalogue rows show permitted thumbnails/category/status with no invented variant counts',async()=>{
 const {CatalogueList,ProductManager}=await server.ssrLoadModule('/src/features/admin/ProductManager.tsx');
 const products=[{id:'local-a',name:'LOCAL TEST long product',category:'Ceramics',image_path:'/images/mug.svg',active:true},{id:'local-b',name:'LOCAL TEST archived',category:'Textiles',image_path:'/images/mug.svg',active:false}];
 const html=renderToStaticMarkup(React.createElement(CatalogueList,{products,select(){}}));assert.match(html,/admin-catalogue-list/);assert.equal((html.match(/class="admin-product-row"/g)??[]).length,2);assert.match(html,/<img[^>]*alt=""[^>]*loading="lazy"/);for(const label of ['Ceramics','Textiles','Active','Archived','editorial fields, variants and reviewed media'])assert.ok(html.includes(label));assert.doesNotMatch(html,/0 variants|Stock:|Delete product/);
 const manager=renderToStaticMarkup(React.createElement(ProductManager,{token:'synthetic'}));assert.match(manager,/Search products/);assert.match(manager,/complete authorized catalogue/);assert.match(manager,/Loading products/);
});
test('catalogue save scope preserves creation receipt and safe exit guidance',async()=>{
 const {ProductEditor}=await server.ssrLoadModule('/src/features/admin/ProductManager.tsx');const html=renderToStaticMarkup(React.createElement(ProductEditor,{product:null,token:'synthetic',saved(){}}));assert.match(html,/Save product applies only this form/);assert.match(html,/initial_price/);assert.match(html,/Deactivate to archive/);
 const source=readFileSync('src/features/admin/ProductManager.tsx','utf8');assert.match(source,/p_operation_id: creation.current.id/);assert.match(source,/creation.current.signature !== signature/);assert.match(source,/previous request may have succeeded/);assert.match(source,/Back to catalogue \/ Cancel/);assert.match(source,/fieldset disabled=\{saving\}/);assert.match(source,/key=\{`editor-\$\{selected\?\.id \?\? 'new'\}`\}/);for(const id of ['product-editorial','product-variants','product-media'])assert.ok(source.includes(`id="${id}"`));
});
test('NLe decimal inputs convert exactly at integer boundaries and reject unsupported syntax',async()=>{
 const {majorToMinor,minorToMajor}=await server.ssrLoadModule('/src/features/admin/priceInput.ts');
 for(const [input,minor] of [['0',0],['0.00',0],['0.01',1],['0.1',10],['12.50',1250],['00012.5',1250],[' 17.29 ',1729],['21474836.47',2147483647]])assert.equal(majorToMinor(input),minor);
 for(const input of ['', ' ', '-1', '+1', '.50', '1.', '1.001', '1,25','1,000.00','1e2','NaN','Infinity','21474836.48','999999999999999'])assert.throws(()=>majorToMinor(input));
 for(const cents of [0,1,10,99,100,1729,2147483647])assert.equal(majorToMinor(minorToMajor(cents)),cents);
 for(const invalid of [-1,1.5,2147483648,NaN])assert.throws(()=>minorToMajor(invalid));assert.equal(minorToMajor(1250),'12.50');
});
test('product editor has grouped fields, paired save/cancel, native category suggestions and safe local previews',async()=>{
 const {ProductEditor,ProductCategory,ProductImagePreview}=await server.ssrLoadModule('/src/features/admin/ProductManager.tsx');const {categorySuggestions}=await server.ssrLoadModule('/src/features/admin/productEditorModel.ts');
 const categories=categorySuggestions([{category:'Ceramics'},{category:'Ceramics'},{category:' Soft  Textiles '}]);assert.equal(categories.length,2);assert.equal(categories[1].label,'Soft Textiles');assert.equal(categories[1].value,' Soft  Textiles ');
 const html=renderToStaticMarkup(React.createElement(ProductEditor,{product:null,token:'synthetic',saved(){},cancel(){},categories}));for(const label of ['Product Information','Media &amp; Appearance','Pricing &amp; Availability','Save Product','Cancel','Initial default variant price (NLe)','Reviewed product image','Background colour (hex)','Display order'])assert.ok(html.includes(label));assert.match(html,/<div class="admin-editor-actions"><button[^>]*disabled=""[^>]*>Save Product<\/button><button type="button">Cancel/);assert.match(html,/list="product-category-options"/);assert.match(html,/inputMode="decimal"/);assert.match(html.match(/<input[^>]*name="initial_price"[^>]*>/)[0],/type="text"/);assert.doesNotMatch(html,/minor units|type="file"/);
 const category=value=>renderToStaticMarkup(React.createElement(ProductCategory,{value,categories}));assert.match(category('New category'),/category is not on the current page/);assert.match(category('Ceramics'),/Choose an existing category/);assert.match(renderToStaticMarkup(React.createElement(ProductCategory,{value:'',categories:[]})),/No category suggestions/);
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(ProductImagePreview,{path:'https://example.invalid/image.jpg'})),/<img/);assert.match(renderToStaticMarkup(React.createElement(ProductImagePreview,{path:'/images/mug.svg'})),/src="\/images\/mug.svg"/);
});
test('confirmed product success requires validated RPC output and survives catalogue return in state',async()=>{
 const {confirmedProductSave,productSaveMessage}=await server.ssrLoadModule('/src/features/admin/productEditorModel.ts');
 const product={id:'local-product',name:'LOCAL TEST confirmed',description:'Local description',category:'Ceramics',image_path:'/images/mug.svg',background_color:'#e9e3d8',display_order:0,active:false,updated_at:'2026-10-08T12:00:00Z'};let captured;
 const client=(data,error=null)=>({rpc:(name,args)=>({setHeader:async(key,value)=>{captured={name,args,key,value};return {data,error};}})});
 const created=await confirmedProductSave(client(product),'synthetic-token','created',{p_operation_id:'synthetic-op',p_initial_price:1250});assert.equal(created.kind,'created');assert.match(productSaveMessage(created),/Product saved successfully. Creation confirmed: LOCAL TEST confirmed/);assert.equal(captured.args.p_initial_price,1250);assert.equal(captured.name,'admin_create_product');assert.equal(captured.value,'Bearer synthetic-token');
 const updated=await confirmedProductSave(client(product),'synthetic-token','updated',{p_id:product.id});assert.match(productSaveMessage(updated),/Update confirmed/);
 for(const data of [null,{}, {...product,id:''},{...product,updated_at:'bad'}])await assert.rejects(confirmedProductSave(client(data),'synthetic-token','created',{}));await assert.rejects(confirmedProductSave(client(product,{code:'transport'}),'synthetic-token','created',{}));await assert.rejects(confirmedProductSave(client(product),'synthetic-token','updated',{p_id:'wrong'}));
 const source=readFileSync('src/features/admin/ProductManager.tsx','utf8');assert.match(source,/setSelected\(undefined\);pagination\.refresh\(\);setNotice\(message\)/);assert.match(source,/role="status" className="admin-save-notice"/);assert.match(source,/cancel=\{\(\)=>choose\(undefined\)\}/);assert.match(source,/creation.current.signature !== signature/);assert.match(source,/submitting.current(?:\|\|blocked)?\)return/);assert.match(readFileSync('src/features/admin/AdminForm.tsx','utf8'),/Your input is retained/);
});
test('variant price labels/summary preserve default identity and meaningful selections',async()=>{
 const {VariantEditor,VariantList}=await server.ssrLoadModule('/src/features/admin/VariantManager.tsx');
 const variants=[{id:'default:local',is_default:true,sku:'DEFAULT-local',options:{},price_cents:1250,active:true},{id:'local-blue',is_default:false,sku:'LOCAL-BLUE',options:{Color:'Blue'},price_cents:1729,active:false}];
 for(const variant of variants){const html=renderToStaticMarkup(React.createElement(VariantEditor,{variant,productId:'local',token:'synthetic',saved(){}}));assert.match(html,/price \(NLe\)/);assert.ok(html.includes(`value="${variant.is_default?'12.50':'17.29'}"`));assert.match(html,/inputMode="decimal"/);assert.doesNotMatch(html,/minor units/);if(variant.is_default)assert.match(html,/readOnly=""/);}
 const list=renderToStaticMarkup(React.createElement(VariantList,{variants,select(){}}));for(const text of ['Default variant','Color: Blue','SKU: LOCAL-BLUE','NLe 12.50','NLe 17.29','Inactive'])assert.ok(list.includes(text));assert.doesNotMatch(list,/Default option|Discount/);
});

test('reviewed asset response preserves canonical paths and rejects malformed registry entries',async()=>{
 const {parseReviewedAssets}=await server.ssrLoadModule('/src/features/admin/reviewedMedia.ts');
 const paths=['/images/mug.svg','/images/arch-vase.webp'];assert.deepEqual(parseReviewedAssets(paths),paths);assert.notEqual(parseReviewedAssets(paths),paths);assert.deepEqual(parseReviewedAssets([]),[]);
 for(const value of [null,{},['https://example.invalid/image.webp'],['/images/../private.webp'],['/images/a.webp?query=1'],['/images/a.webp','/images/a.webp'],[42],['/images/a.exe']])assert.throws(()=>parseReviewedAssets(value));
});
test('reviewed selection requires fresh registry membership and a matching successful preview',async()=>{
 const {canSaveReviewedImage}=await server.ssrLoadModule('/src/features/admin/reviewedMedia.ts');const path='/images/mug.svg';const assets={status:'ready',paths:[path]};const preview={path,status:'ready'};
 assert.equal(canSaveReviewedImage(assets,path,preview),true);
 for(const status of ['loading','error'])assert.equal(canSaveReviewedImage({status,paths:[path]},path,preview),false);
 for(const status of ['loading','broken'])assert.equal(canSaveReviewedImage(assets,path,{path,status}),false);
 assert.equal(canSaveReviewedImage(assets,'/images/unregistered.webp',{path:'/images/unregistered.webp',status:'ready'}),false);assert.equal(canSaveReviewedImage(assets,path,{path:'/images/old.webp',status:'ready'}),false);
});
test('inline reviewed gallery uses native single-selection semantics and canonical values',async()=>{
 const {ReviewedMediaPicker}=await server.ssrLoadModule('/src/features/admin/ReviewedMediaPicker.tsx');const paths=['/images/mug.svg','/images/arch-vase.webp'];
 const render=(assets,preview={path:paths[0],status:'ready'},value=paths[0])=>renderToStaticMarkup(React.createElement(ReviewedMediaPicker,{assets,preview,value,change(){},previewChanged(){},reload(){}}));
 const html=render({status:'ready',paths});assert.equal((html.match(/type="radio"/g)??[]).length,2);assert.equal((html.match(/checked=""/g)??[]).length,1);assert.match(html,/value="\/images\/arch-vase.webp"/);assert.match(html,/arrow keys/);assert.match(html,/Selected image: mug.svg. Not yet saved/);assert.match(html,/alt=""/);assert.doesNotMatch(html,/type="file"|role="dialog"/);
 assert.doesNotMatch(render({status:'error',paths}),/type="radio"|<img/);assert.match(render({status:'error',paths}),/Previous choices are unavailable/);assert.match(render({status:'ready',paths:[]}),/No reviewed assets/);assert.match(render({status:'ready',paths},{path:paths[0],status:'broken'}),/Preview unavailable. Save is blocked/);assert.doesNotMatch(render({status:'ready',paths},{path:'/images/legacy.webp',status:'ready'},'/images/legacy.webp'),/src="\/images\/legacy.webp"/);assert.match(render({status:'ready',paths},{path:'/images/legacy.webp',status:'ready'},'/images/legacy.webp'),/remains unchanged on the storefront/);
});
test('product and primary-image saves retain independent guards, canonical payload and drafts',async()=>{
 const {ProductEditor}=await server.ssrLoadModule('/src/features/admin/ProductManager.tsx');const product={id:'local',name:'LOCAL TEST',image_path:'/images/arch-vase.webp',category:'Ceramics',background_color:'#e9e3d8',display_order:0,active:true};
 for(const item of [null,product]){const html=renderToStaticMarkup(React.createElement(ProductEditor,{product:item,token:'synthetic',saved(){},cancel(){}}));assert.match(html,/Reviewed product image/);assert.match(html,/Loading reviewed media/);assert.match(html,/<input type="hidden" name="image_path" value="\/images\/(mug.svg|arch-vase.webp)"/);assert.match(html,/separate reviewed-image section saves only its own selection/);assert.doesNotMatch(html,/Product image file/);}
 const editor=readFileSync('src/features/admin/ProductManager.tsx','utf8');const media=readFileSync('src/features/admin/ProductMedia.tsx','utf8');const registry=readFileSync('src/features/admin/reviewedMedia.ts','utf8');
 assert.match(editor,/args.p_image_path!==imagePath/);assert.match(editor,/canSaveReviewedImage\(assets,imagePath,preview\)/);assert.match(editor,/creation.current.signature !== signature/);assert.match(media,/canSaveReviewedImage\(assets, path, preview\)/);assert.match(media,/p_expected_updated_at: product.updated_at, p_path: path/);assert.match(media,/parseAdminProduct\(await adminRpc/);assert.match(media,/result.id !== product.id \|\| result.image_path !== path/);assert.match(media,/submitting.current(?:\|\|blocked)?\) return/);assert.doesNotMatch(media,/admin_update_product|admin_create_product/);assert.match(registry,/status: 'error', paths: \[\]/);assert.match(registry,/request === generation.current/);
 const css=readFileSync('src/features/admin/admin.css','utf8');assert.match(css,/minmax\(min\(100%, 10rem\), 1fr\)/);assert.match(css,/admin-media-option:focus-within/);
});

test('inventory parsers retain authorized fields and reject invented or malformed balances',async()=>{
 const {parseInventoryRow,parseInventoryHistory,availableQuantity}=await server.ssrLoadModule('/src/features/admin/inventoryPresentation.ts');
 const fixture={variant_id:'local',product_name:'LOCAL TEST',sku:'LOCAL-BLUE',options:{Colour:'Blue'},active:false,inventory_policy:'tracked',updated_at:'2026-10-08T10:00:00Z',on_hand:10,allocated:3,available:false,private_actor:'hidden',product_active:true};
 const row=parseInventoryRow(fixture);assert.equal(availableQuantity(row),7);assert.equal(row.private_actor,undefined);assert.equal(row.product_active,undefined);assert.equal(availableQuantity({...row,inventory_policy:'untracked'}),null);assert.equal(availableQuantity({...row,on_hand:null,allocated:null}),null);
 for(const change of [{on_hand:-1},{allocated:11},{allocated:null},{on_hand:1.5},{options:{Colour:7}},{active:'yes'},{updated_at:'bad'}])assert.throws(()=>parseInventoryRow({...fixture,...change}));
 const movement={id:'33333333-3333-4333-8333-333333333333',event:'order_release',reason:'LOCAL TEST cancellation',created_at:'2026-10-08T11:00:00Z',on_hand_delta:0,allocated_delta:-3,on_hand_after:10,allocated_after:0,order_id:'11111111-1111-4111-8111-111111111111',actor_user_id:'hidden'};assert.equal(parseInventoryHistory(movement).actor_user_id,undefined);assert.equal(parseInventoryHistory(movement).allocated_delta,-3);
 for(const change of [{event:'payment'},{allocated_after:11},{order_id:'https://example.invalid'},{created_at:'bad'},{on_hand_delta:1.5}])assert.throws(()=>parseInventoryHistory({...movement,...change}));
});
test('inventory filters cover loaded names SKUs options and policy without mutating rows',async()=>{
 const {filterInventory}=await server.ssrLoadModule('/src/features/admin/inventoryPresentation.ts');const rows=[{product_name:'LOCAL TEST Vase',sku:'LOCAL-BLUE',options:{Colour:'Blue'},inventory_policy:'tracked'},{product_name:'LOCAL TEST Throw',sku:'LOCAL-WHITE',options:{Size:'Large'},inventory_policy:'untracked'}];assert.deepEqual(filterInventory(rows,'vase blue','tracked'),[rows[0]]);assert.deepEqual(filterInventory(rows,'large',''),[rows[1]]);assert.deepEqual(filterInventory(rows,'blue','untracked'),[]);assert.equal(rows.length,2);
});
test('inventory preview is signed advisory arithmetic and never fabricates unknown stock',async()=>{
 const {adjustmentPreview}=await server.ssrLoadModule('/src/features/admin/inventoryPresentation.ts');const row={on_hand:10,allocated:3};assert.match(adjustmentPreview(row,'2'),/\+2.*10 → 12/);assert.match(adjustmentPreview(row,'-2'),/-2.*10 → 8/);assert.match(adjustmentPreview(row,'-8'),/server will reject/);assert.match(adjustmentPreview(row,'2147483647'),/server will reject/);assert.match(adjustmentPreview({...row,on_hand:null,allocated:null},'0'),/no current quantity is assumed/);for(const input of ['1.5','1e2','2147483648','-2147483649'])assert.match(adjustmentPreview(row,input),/whole number/);assert.match(adjustmentPreview(row,''),/Enter a signed/);
});
test('inventory presentation separates variant state availability and tracking with truthful history states',async()=>{
 const {InventoryWorklist,InventoryHistory,InventoryManager}=await server.ssrLoadModule('/src/features/admin/InventoryManager.tsx');const row={variant_id:'local',product_name:'LOCAL TEST',sku:'LOCAL-BLUE',options:{Colour:'Blue'},active:false,inventory_policy:'untracked',on_hand:null,allocated:null,available:false};const html=renderToStaticMarkup(React.createElement(InventoryWorklist,{rows:[row],select(){}}));for(const label of ['SKU: LOCAL-BLUE','Colour: Blue','Variant state: Inactive','Catalogue availability: Unavailable','Untracked','Not configured'])assert.ok(html.includes(label));assert.doesNotMatch(html,/Archived|Available stock quantity<\/dt><dd>0/);
 const render=state=>renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(InventoryHistory,{state,retry(){}})));assert.match(render({status:'loading',rows:[]}),/Loading inventory history/);assert.doesNotMatch(render({status:'loading',rows:[]}),/No recorded/);assert.match(render({status:'error',rows:[],message:'Administration access was denied.'}),/role="alert".*Administration access was denied/);assert.match(render({status:'error',rows:[]}),/Retry inventory history/);assert.match(render({status:'ready',rows:[]}),/No recorded stock movements/);
 const history=render({status:'ready',rows:[{id:'local',event:'order_consumption',reason:'LOCAL TEST completed',created_at:'2026-10-08T11:00:00Z',on_hand_delta:-2,allocated_delta:-2,on_hand_after:8,allocated_after:1,order_id:'11111111-1111-4111-8111-111111111111'}]});for(const label of ['100 most recent','Order stock consumed','After movement','On hand: 8','Allocated: 1'])assert.ok(history.includes(label));assert.match(history,/href="\/admin\/orders\/11111111-1111-4111-8111-111111111111"/);assert.doesNotMatch(history,/Admin A|Payment verified/);
 const manager=renderToStaticMarkup(React.createElement(InventoryManager,{token:'synthetic'}));assert.match(manager,/Search loaded inventory/);assert.match(manager,/only to this loaded set/);assert.match(manager,/Product active\/archived state is not supplied/);
});
test('inventory actions retain captured-token RPC boundary receipt identity and stale-policy guard',async()=>{
 const {adminRpc}=await server.ssrLoadModule('/src/features/admin/adminRepository.ts');let captured;const client={rpc:(name,args)=>({setHeader:async(key,value)=>{captured={name,args,key,value};return {data:null,error:{code:'42501'}};}})};await assert.rejects(adminRpc(client,'synthetic-jwt','admin_inventory_history',{p_variant_id:'local'}),/Administration access was denied/);assert.equal(captured.value,'Bearer synthetic-jwt');assert.equal(captured.name,'admin_inventory_history');
 const source=readFileSync('src/features/admin/InventoryManager.tsx','utf8');for(const fragment of ['pending.current.signature!==signature','p_operation_id:pending.current.id','p_expected_updated_at:row.updated_at','Resolve or review the pending adjustment','submitting.current)return','parseAdminRows(data,parseInventoryRow','parseAdminRows(data,parseInventoryHistory'])assert.ok(source.includes(fragment));assert.doesNotMatch(source,/\.from\(|service_role/);const css=readFileSync('src/features/admin/admin.css','utf8');assert.match(css,/admin-inventory-filters[^}]*minmax\(0, 2fr\)/);assert.match(css,/max-width: 700px/);
});

test('membership projections validate dates identifiers states and preserve unknown historic provisioning',async()=>{
 const {parseMembership,parseMembershipEvent}=await server.ssrLoadModule('/src/features/admin/membershipPresentation.ts');const id='11111111-1111-4111-8111-111111111111';const base={user_id:id,active:true,created_at:null,updated_at:'2026-10-08T12:00:00Z',email:'private@example.invalid',reason:'not rendered'};const parsed=parseMembership(base);assert.equal(parsed.created_at,null);assert.equal(parsed.email,undefined);assert.equal(parsed.reason,undefined);
 for(const change of [{user_id:'invalid'},{active:'yes'},{created_at:undefined},{created_at:'bad'},{updated_at:'bad'}])assert.throws(()=>parseMembership({...base,...change}));
 const event={id:'22222222-2222-4222-8222-222222222222',user_id:id,actor_user_id:null,active:false,reason:'LOCAL TEST revoke',created_at:'2026-10-08T13:00:00Z',email:'private@example.invalid'};assert.equal(parseMembershipEvent(event).actor_user_id,null);assert.equal(parseMembershipEvent(event).email,undefined);for(const change of [{actor_user_id:'bad'},{active:null},{reason:''},{reason:'x'.repeat(501)},{created_at:'bad'}])assert.throws(()=>parseMembershipEvent({...event,...change}));
});
test('membership rows identify current account and disable self unknown-identity and busy actions',async()=>{
 const {MembershipRows}=await server.ssrLoadModule('/src/features/admin/MembershipManager.tsx');const id='11111111-1111-4111-8111-111111111111';const member={user_id:id,active:true,created_at:null,updated_at:'2026-10-08T12:00:00Z'};
 const render=(currentUserId,busy=false,active=true)=>renderToStaticMarkup(React.createElement(MembershipRows,{members:[{...member,active}],currentUserId,busy,revoke(){}}));const own=render(id);assert.match(own,/Your current account/);assert.match(own,/Self-revocation is disabled/);assert.match(own,/<fieldset disabled=""/);assert.match(own,/Not recorded — historic provisioning date unknown/);assert.match(own,/<time dateTime="2026-10-08T12:00:00Z"/);
 const other=render('22222222-2222-4222-8222-222222222222');assert.doesNotMatch(other,/<fieldset disabled/);assert.match(other,/textarea name="reason" required="" maxLength="500" aria-describedby=/);assert.match(other,/does not delete the Auth account/);assert.match(render(null),/Current Auth identity is unavailable/);assert.match(render(null),/<fieldset disabled/);assert.match(render('other',true),/<fieldset disabled/);assert.match(render(id,false,false),/Revoked/);assert.doesNotMatch(render(id,false,false),/<form/);assert.match(render(id,false,false),/Reactivation is a privileged service-only operation/);
 for(const html of [own,render(null),other]){
  const help=`membership-help-${id}`;
  const group=html.match(new RegExp(`<fieldset[^>]*aria-describedby="${help}"`));
  assert.ok(group);
  assert.ok(html.indexOf(`<p id="${help}"`)<group.index);
  assert.match(html,new RegExp(`<fieldset[^>]*aria-describedby="${help}"`));
  assert.match(html,/<legend>Membership revocation<\/legend>/);
  assert.match(html,new RegExp(`<button[^>]*aria-describedby="${help}"`));
 }
});
test('membership audit preserves actual events unknown actor and capped empty history guidance',async()=>{
 const {MembershipHistory}=await server.ssrLoadModule('/src/features/admin/MembershipManager.tsx');const id='11111111-1111-4111-8111-111111111111';const render=history=>renderToStaticMarkup(React.createElement(MembershipHistory,{history,currentUserId:id}));const empty=render([]);assert.match(empty,/No recorded membership changes/);assert.match(empty,/100 recorded changes/);const html=render([{id:'local',user_id:id,actor_user_id:null,active:false,reason:'LOCAL TEST reason',created_at:'2026-10-08T12:00:00Z'}]);assert.match(html,/Business access revoked/);assert.match(html,/Actor account ID: Not recorded/);assert.match(html,/your current account/);assert.match(html,/LOCAL TEST reason/);assert.doesNotMatch(html,/Privileged service|Owner|staff@example|Invitation sent/);
});
test('membership loading denial stale and validation failure never expose stale actions or raw errors',async()=>{
 const {MembershipContent}=await server.ssrLoadModule('/src/features/admin/MembershipManager.tsx');const {membershipFailure}=await server.ssrLoadModule('/src/features/admin/membershipPresentation.ts');const member={user_id:'11111111-1111-4111-8111-111111111111',active:true,created_at:null,updated_at:'2026-10-08T12:00:00Z'};const render=state=>renderToStaticMarkup(React.createElement(MembershipContent,{state,currentUserId:'other',busy:false,revoke(){},reload(){}}));assert.match(render({status:'loading',members:[member],history:[]}),/Loading memberships/);assert.doesNotMatch(render({status:'loading',members:[member],history:[]}),/Revoke membership|11111111/);
 for(const cause of [new Error('Administration access was denied. private@example.invalid'),new Error('This record changed. private text'),new Error('PII provider error')]){const message=membershipFailure(cause,true);assert.doesNotMatch(message,/private|PII|provider/);const html=render({status:'error',members:[member],history:[],message});assert.match(html,/tabindex="-1"/);assert.match(html,/Reload memberships/);assert.doesNotMatch(html,/Revoke membership|11111111/);}
 assert.match(membershipFailure(new Error('This record changed.'),true),/review its current state/);
});
test('membership revoke uses captured JWT stale guard and validated reason without self authorization bypass',async()=>{
 const {revokeMembership,canRevokeMembership}=await server.ssrLoadModule('/src/features/admin/membershipPresentation.ts');const member={user_id:'11111111-1111-4111-8111-111111111111',active:true,created_at:null,updated_at:'2026-10-08T12:00:00Z'};const current='22222222-2222-4222-8222-222222222222';let captured;const client={rpc:(name,args)=>({setHeader:async(key,value)=>{captured={name,args,key,value};return {data:null,error:null};}})};assert.equal(canRevokeMembership(member,member.user_id),false);assert.equal(canRevokeMembership(member,null),false);assert.equal(canRevokeMembership({...member,active:false},current),false);
 for(const [uid,reason] of [[member.user_id,'reason'],[null,'reason'],[current,' '],[current,'x'.repeat(501)]])await assert.rejects(revokeMembership(client,'synthetic-jwt',member,uid,reason));assert.equal(captured,undefined);await revokeMembership(client,'synthetic-jwt',member,current,' LOCAL TEST reason ');assert.deepEqual(captured,{name:'admin_revoke_membership',args:{p_user_id:member.user_id,p_expected_updated_at:member.updated_at,p_reason:'LOCAL TEST reason'},key:'Authorization',value:'Bearer synthetic-jwt'});
 const denied={rpc:()=>({setHeader:async()=>({data:null,error:{code:'42501'}})})};await assert.rejects(revokeMembership(denied,'still-valid-synthetic-jwt',member,current,'reason'),/Administration access was denied/);
 const source=readFileSync('src/features/admin/MembershipManager.tsx','utf8');assert.match(source,/currentUserId=session\?\.user.id\?\?null/);assert.match(source,/request===generation.current/);assert.match(source,/members:\[\],history:\[\],message:membershipFailure\(cause,true\)/);assert.match(source,/submitting.current\|\|!canRevokeMembership/);assert.match(source,/window.confirm/);assert.doesNotMatch(source,/set_business_admin|service_role|signUp/);
});

test('shared mutation form provides associated focused error summary retained input and busy controls',async()=>{
 const {AdminForm}=await server.ssrLoadModule('/src/features/admin/AdminForm.tsx');const render=(error,busy=false)=>renderToStaticMarkup(React.createElement(AdminForm,{error,busy,onSubmit(){},className:'admin-form'},React.createElement('label',null,'Reason',React.createElement('textarea',{name:'reason',required:true,defaultValue:'LOCAL TEST retained'}))));const html=render('Save could not be confirmed.');assert.match(html,/data-admin-mutation="true"/);assert.match(html,/data-admin-uncertain="true"/);const id=html.match(/aria-describedby="([^"]+)"/)[1];assert.ok(html.includes(`id="${id}"`));assert.match(html,/tabindex="-1" class="admin-form-error"/);assert.match(html,/LOCAL TEST retained/);assert.match(html,/Review the record before retrying an unconfirmed operation/);assert.match(render('',true),/aria-busy="true"/);assert.match(render('',true),/<fieldset class="admin-form-controls" disabled=""/);assert.match(render('',true),/role="status">Saving changes/);assert.doesNotMatch(render(''),/admin-form-error/);
});
test('field descriptions preserve existing help and uncertain leave copy requires record review',async()=>{
 const {describeAdminError,adminLeaveMessage,shouldBlockAdminNavigation}=await server.ssrLoadModule('/src/features/admin/adminFormBehavior.ts');assert.equal(describeAdminError('price-help colour-help','save-error'),'price-help colour-help save-error');assert.equal(describeAdminError('save-error','save-error'),'save-error');assert.equal(describeAdminError(null,'save-error'),'save-error');assert.match(adminLeaveMessage(true),/may already have succeeded.*Review.*before starting a new operation/);assert.match(adminLeaveMessage(false),/Unsaved drafts/);
 const current={pathname:'/admin/orders/local',search:'?status=placed'};for(const next of [{pathname:'/admin/orders',search:''},{pathname:'/',search:''},{pathname:current.pathname,search:''}]){assert.equal(shouldBlockAdminNavigation(current,next,true),true);assert.equal(shouldBlockAdminNavigation(current,next,false),false);}assert.equal(shouldBlockAdminNavigation(current,{...current},true),false);
});
test('order confirmation preserves stock consequences payment separation and no refund claim',async()=>{
 const {orderTransitionConfirmation}=await server.ssrLoadModule('/src/features/admin/orderOperations.ts');for(const state of ['cancelled','completed','confirmed']){const copy=orderTransitionConfirmation(state);assert.match(copy,/Payment status will not change/);assert.match(copy,/does not verify payment or issue a refund/);}assert.match(orderTransitionConfirmation('cancelled'),/releases allocated stock/);assert.match(orderTransitionConfirmation('completed'),/consumes allocated stock/);
 const source=readFileSync('src/features/admin/OrderManager.tsx','utf8');assert.match(source,/!pending.current&&!window.confirm\(orderTransitionConfirmation\(to\)\)/);assert.match(source,/pending.current.signature!==signature/);assert.match(source,/p_operation_id:pending.current.id/);assert.match(source,/submitting.current(?:\|\|blocked)?\)return/);assert.match(source,/Payment status is unchanged/);
});
test('variant editor pairs native Save Cancel and keeps independent draft and in-flight protection',async()=>{
 const {VariantEditor}=await server.ssrLoadModule('/src/features/admin/VariantManager.tsx');const html=renderToStaticMarkup(React.createElement(VariantEditor,{variant:null,productId:'local',token:'synthetic',saved(){},cancel(){}}));assert.match(html,/admin-editor-actions/);assert.match(html,/>Save variant<\/button><button type="button">Cancel variant draft/);assert.match(html,/data-admin-mutation="true"/);const source=readFileSync('src/features/admin/VariantManager.tsx','utf8');assert.match(source,/submitting.current(?:\|\|blocked)?\)return/);assert.match(source,/finally\{submitting.current=false/);assert.match(source,/If a save was unconfirmed, reload and review the variants first/);assert.match(source,/Product and media drafts are saved separately/);assert.match(source,/if\(saving\)return/);
});
test('native route and unload safeguards retain cleanup and main provider route composition',async()=>{
 const component=readFileSync('src/features/admin/AdminForm.tsx','utf8');const behavior=readFileSync('src/features/admin/adminFormBehavior.ts','utf8');const main=readFileSync('src/main.tsx','utf8');assert.match(component,/useBlocker\(/);assert.match(component,/blocker.proceed\(\).*else blocker.reset\(\)/);assert.match(component,/summary.current\?\.focus/);assert.match(component,/control.setAttribute\('aria-describedby'/);assert.match(component,/aria-invalid','true'/);assert.match(behavior,/beforeunload/);assert.match(behavior,/removeEventListener\('click',leave,true\)/);assert.match(behavior,/removeEventListener\('beforeunload',unload\)/);assert.match(behavior,/target.current\?\.focus/);assert.match(main,/createBrowserRouter\(createRoutesFromElements/);assert.match(main,/<AuthProvider><ProductProvider><CartProvider><Layout \/><\/CartProvider><\/ProductProvider><\/AuthProvider>/);
 for(const path of ['/admin/*','/cart','/checkout','/account','/account/orders','/account/orders/:orderId','/products/:productId'])assert.ok(main.includes(`path="${path}"`));assert.doesNotMatch(component,/role="dialog"|service_role|\.rpc\(/);
});
test('product inventory cancellation and membership retain receipts and safe feedback boundaries',()=>{
 const product=readFileSync('src/features/admin/ProductManager.tsx','utf8');const inventory=readFileSync('src/features/admin/InventoryManager.tsx','utf8');const cancellation=readFileSync('src/features/orders/CancellationRequest.tsx','utf8');const member=readFileSync('src/features/admin/MembershipManager.tsx','utf8');const media=readFileSync('src/features/admin/ProductMedia.tsx','utf8');for(const fragment of ['creation.current.signature !== signature','p_operation_id: creation.current.id','Leave this product workspace?','useAdminReturnFocus(notice,noticeTarget)'])assert.ok(product.includes(fragment));assert.match(inventory,/p_operation_id:pending.current.id/);assert.match(inventory,/p_expected_updated_at:row.updated_at/);assert.match(inventory,/error=\{operation==='policy'\?error:''\}/);assert.match(cancellation,/submitting.current(?:\|\|blocked)?\)return/);assert.match(cancellation,/pendingReason.current !== reason/);assert.match(cancellation,/value=\{typedReason\}/);assert.match(cancellation,/Reject this request\? This does not change the order, payment or inventory/);assert.match(member,/currentUserId=session\?\.user.id/);assert.match(member,/window.confirm/);assert.match(member,/uncertain:true/);assert.match(media,/result.id !== product.id \|\| result.image_path !== path/);
});

test('admin product projection validates required bounds and drops unused private fields while preserving categories and legacy HTTPS',async()=>{
 const {parseAdminProduct}=await server.ssrLoadModule('/src/features/admin/adminRepository.ts');const {parseAdminRows}=await server.ssrLoadModule('/src/features/admin/adminValidation.ts');
 const product={id:'synthetic-product',name:'LOCAL TEST',description:'LOCAL TEST description',category:' Local  Category ',image_path:'/images/mug.svg',background_color:'#e9e3d8',display_order:0,active:false,updated_at:'2026-10-08T00:00:00Z'};
 const parsed=parseAdminProduct({...product,private_field:'must-not-project'});assert.deepEqual(parsed,product);assert.equal(parsed.private_field,undefined);assert.notEqual(parsed,product);assert.equal(parseAdminProduct({...product,image_path:'https://example.invalid/legacy.webp'}).image_path,'https://example.invalid/legacy.webp');
 for(const key of Object.keys(product)){const missing={...product};delete missing[key];assert.throws(()=>parseAdminProduct(missing));}
 for(const patch of [{name:''},{name:'x'.repeat(201)},{category:' '},{background_color:'red'},{image_path:'/images/../private.webp'},{image_path:'http://example.invalid/a.webp'},{image_path:'https://user:password@example.invalid/a.webp'},{display_order:-1},{display_order:1.2},{display_order:2147483648},{active:1},{updated_at:'bad'}])assert.throws(()=>parseAdminProduct({...product,...patch}));
 assert.throws(()=>parseAdminRows([product,product],parseAdminProduct,row=>row.id));assert.deepEqual(parseAdminRows([],parseAdminProduct,row=>row.id),[]);
});

test('admin variants validate actual parent/default/options/currency identities and reject malformed arrays and private projections',async()=>{
 const {parseAdminVariant,parseAdminVariants}=await server.ssrLoadModule('/src/features/admin/adminVariants.ts');const row={id:'default:local',product_id:'local',sku:'DEFAULT-local',options:{},is_default:true,price_cents:0,currency:'NLE',active:false,inventory_policy:'untracked',updated_at:'2026-10-08T00:00:00Z'};
 assert.deepEqual(parseAdminVariants([row],'local'),[row]);assert.equal(parseAdminVariant({...row,private_field:'private'}).private_field,undefined);assert.deepEqual(parseAdminVariants([],'local'),[]);
 for(const key of Object.keys(row)){const missing={...row};delete missing[key];assert.throws(()=>parseAdminVariant(missing));}
 for(const patch of [{options:[]},{options:{Color:4}},{price_cents:-1},{price_cents:2147483648},{is_default:'true'},{id:'other'},{sku:'other'},{currency:'USD'},{inventory_policy:'unknown'},{updated_at:null}])assert.throws(()=>parseAdminVariant({...row,...patch}));assert.throws(()=>parseAdminVariants([row],'wrong-parent'));assert.throws(()=>parseAdminVariants([row,row],'local'));assert.throws(()=>parseAdminVariants({},'local'));
 const option={...row,id:'option',sku:'LOCAL-OPTION',is_default:false,options:{Size:'Large',Color:'Blue'}};assert.deepEqual(parseAdminVariant(option).options,{Color:'Blue',Size:'Large'});assert.throws(()=>parseAdminVariants([option,{...option,id:'other'}],'local'));
});

test('admin histories are bounded typed projections with optional nullable fields preserved and no fabricated balances',async()=>{
 const {parseAdminRows}=await server.ssrLoadModule('/src/features/admin/adminValidation.ts');const {parseInventoryRow,parseInventoryHistory,parseInventoryAdjustment}=await server.ssrLoadModule('/src/features/admin/inventoryPresentation.ts');const {parseMembership,parseMembershipEvent}=await server.ssrLoadModule('/src/features/admin/membershipPresentation.ts');const {parseAdminOrderHistory}=await server.ssrLoadModule('/src/features/admin/adminOrders.ts');
 const inventory={variant_id:'local',product_name:'LOCAL TEST',sku:'LOCAL',options:{},active:false,inventory_policy:'untracked',updated_at:'2026-10-08T00:00:00Z',on_hand:null,allocated:null,available:false};assert.equal(parseInventoryRow(inventory).on_hand,null);for(const patch of [{on_hand:undefined},{on_hand:null,allocated:0},{on_hand:1,allocated:2}])assert.throws(()=>parseInventoryRow({...inventory,...patch}));
 const stock={on_hand:0,allocated:0};assert.deepEqual(parseInventoryAdjustment(stock),stock);for(const invalid of [null,[],{}, {on_hand:null,allocated:null},{on_hand:0,allocated:1},{on_hand:1.2,allocated:0}])assert.throws(()=>parseInventoryAdjustment(invalid));
 const movement={id:'33333333-3333-4333-8333-333333333333',event:'stock_adjustment',reason:'LOCAL TEST',created_at:inventory.updated_at,on_hand_delta:0,allocated_delta:0,on_hand_after:0,allocated_after:0,order_id:null};assert.equal(parseInventoryHistory(movement).order_id,null);assert.throws(()=>parseAdminRows([movement,movement],parseInventoryHistory,row=>row.id,100));
 const member={user_id:'11111111-1111-4111-8111-111111111111',active:true,created_at:null,updated_at:inventory.updated_at};assert.equal(parseMembership(member).created_at,null);const membershipEvent={id:member.user_id,user_id:member.user_id,actor_user_id:null,active:false,reason:'LOCAL TEST',created_at:inventory.updated_at};assert.equal(parseMembershipEvent(membershipEvent).actor_user_id,null);
 const transition={operation_id:'44444444-4444-4444-8444-444444444444',from_status:'placed',to_status:'confirmed',reason:'LOCAL TEST',created_at:inventory.updated_at};assert.deepEqual(parseAdminOrderHistory({...transition,private_actor:'private'}),transition);for(const patch of [{reason:''},{from_status:'paid'},{to_status:'refunded'},{created_at:'bad'}])assert.throws(()=>parseAdminOrderHistory({...transition,...patch}));assert.throws(()=>parseAdminRows(Array(101).fill(transition),parseAdminOrderHistory,row=>row.operation_id,100));
});

test('admin transport and SDK errors never expose provider detail and supported codes remain safely distinguishable',async()=>{
 const {adminRpc,adminReadFailure,checkAdmin}=await server.ssrLoadModule('/src/features/admin/adminRepository.ts');const secretLike='synthetic-private-provider-detail';const thrown={rpc:()=>({setHeader:async()=>{throw new Error(secretLike);}})};
 await assert.rejects(adminRpc(thrown,'synthetic-token','admin_test'),error=>!error.message.includes(secretLike)&&error.kind==='uncertain');await assert.rejects(checkAdmin(thrown,'synthetic-token'),error=>!error.message.includes(secretLike));assert.doesNotMatch(adminReadFailure(new Error(secretLike),'Products'),new RegExp(secretLike));
 for(const [code,kind] of [['42501','denied'],['40001','stale'],['22023','uncertain']])await assert.rejects(adminRpc({rpc:()=>({setHeader:async()=>({data:null,error:{code,message:secretLike,details:secretLike}})})},'synthetic-token','admin_test'),error=>error.kind===kind&&!error.message.includes(secretLike));
});

test('order acknowledgements cannot fabricate status or payment success and cancellation parser preserves optional legacy timestamps',async()=>{
 const {confirmOrderTransition}=await server.ssrLoadModule('/src/features/admin/adminOrders.ts');const order={id:'synthetic-order',payment_status:'awaiting_payment'};assert.doesNotThrow(()=>confirmOrderTransition({id:order.id,status:'confirmed',payment_status:'awaiting_payment'},order,'confirmed'));
 for(const value of [null,[],{}, {id:'wrong',status:'confirmed',payment_status:'awaiting_payment'},{id:order.id,status:'completed',payment_status:'awaiting_payment'},{id:order.id,status:'confirmed',payment_status:'paid'}])assert.throws(()=>confirmOrderTransition(value,order,'confirmed'));
 const {parseCancellation}=await server.ssrLoadModule('/src/features/orders/cancellation.ts');const base={order_id:'synthetic-order',reason:'',requested_at:'2026-10-08T00:00:00Z',status:'pending',resolution:null};assert.deepEqual(parseCancellation(base),base);assert.equal(parseCancellation({...base,resolved_at:null}).resolved_at,null);assert.throws(()=>parseCancellation({...base,resolution:'unexpected resolution'}));assert.throws(()=>parseCancellation({...base,reason:'x'.repeat(501)}));assert.throws(()=>parseCancellation([]));
});
