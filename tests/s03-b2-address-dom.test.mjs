// B2-03 covers the saved-address surfaces, which no suite exercised before this file.
// The defects it pins were reachable from source: a create form and an edit form can be
// mounted at the same time, and their field ids collided, so a label in one form resolved
// to the other form's control. Native validation messages also never reached assistive
// tech here, unlike the checkout fields that already use FormField.
// Evidence class: real components, rendered in jsdom against a synthetic session and a
// synthetic Supabase client. No hosted data, no sign-in.
import assert from 'node:assert/strict';
import {test,before,after,afterEach} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from './helpers/vite.mjs';

const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/'});
const document=dom.window.document;
for(const name of ['window','document','Element','Node','HTMLElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');

const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid'};
const session={access_token:'synthetic-jwt',user};
const savedAddress={id:'addr-1',customer_id:user.id,label:'Home',street_address:'1 Aberdeen Road',area:'Aberdeen',city:'Freetown',zone_id:'zone-1',is_default:true,created_at:'2026-11-01T00:00:00.000Z',updated_at:'2026-11-01T00:00:00.000Z'};

let server,root,AddressForm,AddressCard,AddressManager,AuthContext,deliveryConfig,formatMoney;
let fixtures=[];
const calls=[];
let deleteGate=null;

function table(name){
  let mode='select';
  const filters=[];
  const builder={
    select(){return builder;},
    delete(){mode='delete';calls.push({op:'delete'});return builder;},
    eq(column,value){filters.push({column,value});return builder;},
    order(){return builder;},
    maybeSingle(){return Promise.resolve({data:rows()[0]??null,error:null});},
    then(resolve,reject){
      if(mode==='delete'){
        // Only the rows the request actually filtered for disappear, as they would on the host.
        const result=(deleteGate??Promise.resolve({error:null})).then(value=>{
          if(!value.error)fixtures=fixtures.filter(row=>!filters.every(filter=>row[filter.column]===filter.value));
          return value;
        });
        return result.then(resolve,reject);
      }
      return Promise.resolve({data:rows(),error:null}).then(resolve,reject);
    },
  };
  const rows=()=>name==='customer_addresses'?fixtures:[];
  return builder;
}

const client={
  from:name=>table(name),
  rpc(name,params){
    calls.push({op:'rpc',name,params});
    if(name==='save_customer_address'){
      const row={...savedAddress,...params.p_address,id:params.p_address_id??'addr-2',customer_id:user.id};
      fixtures=params.p_address_id?fixtures.map(item=>item.id===row.id?row:item):[...fixtures,row];
      return Promise.resolve({data:row,error:null});
    }
    if(name==='set_default_address')fixtures=fixtures.map(item=>({...item,is_default:item.id===params.p_address_id}));
    return Promise.resolve({data:null,error:null});
  },
};

before(async()=>{
  server=await createServer({root:process.cwd(),configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'isolated-address-client',enforce:'pre',load(id){
    if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__addressTestClient;}';
  }}]});
  globalThis.__addressTestClient=client;
  ({AddressForm}=await server.ssrLoadModule('/src/features/addresses/AddressForm.tsx'));
  ({AddressCard}=await server.ssrLoadModule('/src/features/addresses/AddressCard.tsx'));
  ({AddressManager}=await server.ssrLoadModule('/src/features/addresses/AddressManager.tsx'));
  ({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({deliveryConfig}=await server.ssrLoadModule('/src/config/fulfilment.ts'));
  ({formatMoney}=await server.ssrLoadModule('/src/config/shop.ts'));
});
afterEach(async()=>{
  if(root)await act(async()=>root.unmount());
  root=undefined;
  host().replaceChildren();
  fixtures=[];calls.length=0;deleteGate=null;
});
after(async()=>{await server?.close();delete globalThis.__addressTestClient;dom.window.close();});

const host=()=>document.getElementById('root');
const heading=()=>host().querySelector('.address-manager > h2');
const cards=()=>[...host().querySelectorAll('[data-address-id]')];
async function mount(node){root=createRoot(host());await act(async()=>root.render(node));}
async function rerender(node){await act(async()=>root.render(node));}
function manager(){
  return React.createElement(AuthContext.Provider,{value:{loading:false,session,error:null,signIn:async()=>{},signOut:async()=>{}}},React.createElement(AddressManager));
}
const event=(name,bubbles=false)=>new dom.window.Event(name,{bubbles,cancelable:bubbles});
// Typing into a controlled field has to bypass the value setter React installs on the
// node, otherwise the tracker sees no change and onChange never runs.
function type(node,value){
  const select=node.tagName==='SELECT';
  const {set}=Object.getOwnPropertyDescriptor(select?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value');
  set.call(node,value);
  return new dom.window.Event(select?'change':'input',{bubbles:true,cancelable:true});
}

test('co-mounted address forms never share a field id',async()=>{
  await mount(React.createElement('div',null,
    React.createElement(AddressForm,{onSubmit:()=>{},onCancel:()=>{}}),
    React.createElement(AddressForm,{address:savedAddress,onSubmit:()=>{},onCancel:()=>{}})));
  const ids=[...host().querySelectorAll('input[id],select[id]')].map(node=>node.id);
  assert.equal(ids.length,10,'four text inputs and one select per form');
  assert.equal(new Set(ids).size,ids.length,'ids must be unique while a create and an edit form are open together');
  for(const label of host().querySelectorAll('label[for]')){
    const control=document.getElementById(label.getAttribute('for'));
    assert.ok(control,`the label “${label.textContent.trim()}” must resolve to a control`);
    assert.equal(control.closest('form'),label.closest('form'),'a label must drive its own form, not the first match in the document');
  }
});

test('an empty required address field reports its problem to assistive tech and clears once fixed',async()=>{
  await mount(React.createElement(AddressForm,{onSubmit:()=>{},onCancel:()=>{}}));
  const street=host().querySelector('input[autocomplete="street-address"]');
  assert.equal(street.getAttribute('aria-invalid'),null,'no error is claimed before the first attempt');
  await act(async()=>{street.dispatchEvent(event('invalid'));});
  assert.equal(street.getAttribute('aria-invalid'),'true');
  const described=street.getAttribute('aria-describedby').split(' ').map(id=>document.getElementById(id));
  assert.equal(described.length,1);
  assert.equal(described[0].className,'field-error','the message uses the established checkout error styling');
  assert.ok(street.validationMessage.length>0,'the browser supplied the wording');
  assert.equal(described[0].textContent.trim(),street.validationMessage.trim());
  await act(async()=>{street.dispatchEvent(type(street,'1 Aberdeen Road'));});
  assert.equal(street.getAttribute('aria-invalid'),null);
  assert.equal(street.getAttribute('aria-describedby'),null);
  assert.equal(host().querySelector('.field-error'),null);
});

test('required fields carry a label indicator and the zone hint is attached to its control',async()=>{
  await mount(React.createElement(AddressForm,{onSubmit:()=>{},onCancel:()=>{}}));
  const indicators=host().querySelectorAll('.form-field label > span[aria-hidden="true"]');
  assert.equal(indicators.length,5,'four text fields and the zone select are required');
  for(const span of indicators)assert.equal(span.textContent,' *');
  const zone=host().querySelector('select');
  const hint=document.getElementById(zone.getAttribute('aria-describedby'));
  assert.equal(hint.className,'small-note');
  assert.match(hint.textContent,/Select the zone that covers your delivery address/);
  await act(async()=>{zone.dispatchEvent(event('invalid'));});
  assert.equal(zone.getAttribute('aria-invalid'),'true');
  const ids=zone.getAttribute('aria-describedby').split(' ');
  assert.equal(ids.length,2,'the hint and the new error are both referenced');
  assert.ok(ids.map(id=>document.getElementById(id)).every(node=>node));
});

test('zone fees are announced through the central money formatter',async()=>{
  await mount(React.createElement(AddressForm,{onSubmit:()=>{},onCancel:()=>{}}));
  const active=deliveryConfig.zones.filter(zone=>zone.active);
  const options=[...host().querySelectorAll('select option')].slice(1);
  assert.equal(options.length,active.length);
  assert.deepEqual(options.map(option=>option.textContent),active.map(zone=>`${zone.coverage} — ${formatMoney(zone.fee)}`));
  assert.match(options[0].textContent,/NLE \d/,'the currency label leads, as it does in the cart and order surfaces');
});

test('a write in flight makes the address form inert instead of queueing another one',async()=>{
  await mount(React.createElement(AddressForm,{busy:true,onSubmit:()=>{},onCancel:()=>{}}));
  assert.equal(host().querySelector('form').getAttribute('aria-busy'),'true');
  const controls=[...host().querySelectorAll('input,select,button')];
  assert.equal(controls.length,8,'four text inputs, a select, a checkbox, save and cancel');
  assert.ok(controls.every(control=>control.disabled),'every address control is disabled while a mutation is running');
  await rerender(React.createElement(AddressForm,{onSubmit:()=>{},onCancel:()=>{}}));
  assert.equal(host().querySelector('form').getAttribute('aria-busy'),null);
  assert.ok([...host().querySelectorAll('input,select,button')].every(control=>!control.disabled));
});

test('card actions are inert during a mutation and keep their accessible names',async()=>{
  await mount(React.createElement(AddressCard,{address:{...savedAddress,is_default:false},busy:true,onEdit:()=>{},onDelete:()=>{},onSetDefault:()=>{}}));
  const buttons=[...host().querySelectorAll('button')];
  assert.equal(buttons.length,3);
  assert.ok(buttons.every(button=>button.disabled));
  assert.deepEqual(buttons.map(button=>button.getAttribute('aria-label')),['Set Home as default address','Edit Home address','Delete Home address']);
  await rerender(React.createElement(AddressCard,{address:{...savedAddress,is_default:false},onEdit:()=>{},onDelete:()=>{},onSetDefault:()=>{}}));
  assert.ok([...host().querySelectorAll('button')].every(button=>!button.disabled));
});

test('deletion confirms inside the page, cancels without a write and announces the result',async()=>{
  fixtures=[savedAddress];
  await mount(manager());
  const count=host().querySelector('.address-count');
  assert.equal(count.getAttribute('aria-live'),'polite','the quota is announced when it changes');
  assert.match(count.textContent,/1 of 5 addresses used/);
  const opener=host().querySelector('.delete-btn');
  opener.focus();
  await act(async()=>{opener.click();});
  const dialog=host().querySelector('dialog');
  assert.ok(dialog,'deletion asks through the shared accessible dialog instead of a browser confirm');
  assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent,'Delete this address?');
  assert.match(document.getElementById(dialog.getAttribute('aria-describedby')).textContent,/Home/);
  assert.equal(document.activeElement.textContent,'Cancel','the destructive path is never the default focus');
  assert.equal(calls.filter(call=>call.op==='delete').length,0,'nothing is written before confirmation');
  await act(async()=>{dialog.querySelectorAll('button')[0].click();});
  assert.equal(host().querySelector('dialog'),null);
  assert.equal(document.activeElement,opener,'focus returns to the control that asked');
  assert.equal(calls.filter(call=>call.op==='delete').length,0,'cancelling writes nothing');

  let release;
  deleteGate=new Promise(resolve=>{release=()=>resolve({error:null});});
  await act(async()=>{host().querySelector('.delete-btn').click();});
  await act(async()=>{host().querySelector('dialog').querySelectorAll('button')[1].click();});
  assert.equal(host().querySelector('dialog'),null,'the dialog closes as the write starts');
  assert.ok(host().querySelector('.delete-btn').disabled,'card actions are inert while the delete is running');
  assert.equal(calls.filter(call=>call.op==='delete').length,1);
  await act(async()=>{release();});
  assert.match(host().querySelector('.address-count').textContent,/0 of 5 addresses used/);
  assert.equal(host().querySelector('.delete-btn'),null);
  assert.match(host().textContent,/No saved addresses yet/);
});

test('a rejected address write surfaces its message without losing the panel',async()=>{
  fixtures=[savedAddress];
  await mount(manager());
  await act(async()=>{host().querySelector('.add-address-btn').click();});
  assert.ok(host().querySelector('.address-form'));
  // A row the shopper does not own comes back as a PostgREST error, not a thrown rejection.
  deleteGate=Promise.resolve({error:{message:'new row violates row-level security policy'}});
  await act(async()=>{host().querySelector('.delete-btn').click();});
  await act(async()=>{host().querySelector('dialog').querySelectorAll('button')[1].click();});
  await act(async()=>{});
  const alert=host().querySelector('[role=alert].address-error');
  assert.ok(alert,'the failure is announced');
  assert.match(alert.textContent,/Could not delete address/,'the panel keeps the wording the repository already uses');
  assert.equal(host().querySelector('.delete-btn').disabled,false,'controls come back so the shopper can retry');
  assert.ok(host().querySelector('.address-form'),'the open create form survives an unrelated failure');
});

test('saving a new address keeps the existing RPC contract and closes the panel',async()=>{
  await mount(manager());
  await act(async()=>{host().querySelector('.add-address-btn').click();});
  const form=host().querySelector('.address-form');
  const [labelField,streetField,areaField,cityField]=[...form.querySelectorAll('input[type="text"]')];
  const zone=form.querySelector('select');
  await act(async()=>{
    labelField.dispatchEvent(type(labelField,' Work '));
    streetField.dispatchEvent(type(streetField,'8 Hilltop Road'));
    areaField.dispatchEvent(type(areaField,'Hilltop'));
    cityField.dispatchEvent(type(cityField,'Freetown'));
    zone.dispatchEvent(type(zone,'zone-2'));
  });
  await act(async()=>{form.dispatchEvent(event('submit',true));});
  const writes=calls.filter(call=>call.op==='rpc');
  assert.equal(writes.length,1,'one write per save');
  assert.equal(writes[0].name,'save_customer_address');
  assert.equal(writes[0].params.p_address_id,null,'a create keeps the null id the function expects');
  assert.deepEqual(writes[0].params.p_address,{label:'Work',street_address:'8 Hilltop Road',area:'Hilltop',city:'Freetown',zone_id:'zone-2',is_default:false},'values are trimmed exactly as before');
  assert.equal(host().querySelector('.address-form'),null,'the panel closes once the write lands');
  assert.match(host().querySelector('.address-count').textContent,/1 of 5 addresses used/);
  assert.equal(host().querySelector('.no-addresses'),null);
});

test('editing keeps the stored row in the fields and writes through the same id',async()=>{  fixtures=[savedAddress,{...savedAddress,id:'addr-9',label:'Work',is_default:false}];
  await mount(manager());
  const cards=[...host().querySelectorAll('.address-card')];
  assert.equal(cards.length,2);
  await act(async()=>{cards[0].querySelector('.edit-btn').click();});
  const form=host().querySelector('.address-form');
  assert.equal(form.querySelector('h3').textContent,'Edit Address','the form says which row it is writing');
  const fields=[...form.querySelectorAll('input[type="text"]')];
  assert.deepEqual(fields.map(field=>field.value),['Home','1 Aberdeen Road','Aberdeen','Freetown'],'every field starts from the stored row');
  assert.equal(form.querySelector('input[type="checkbox"]').checked,true,'the default flag is shown before the edit');
  await act(async()=>{fields[2].dispatchEvent(type(fields[2],'Lake Cocos'));});
  await act(async()=>{form.dispatchEvent(event('submit',true));});
  const writes=calls.filter(call=>call.op==='rpc');
  assert.equal(writes.length,1);
  assert.equal(writes[0].params.p_address_id,'addr-1');
  assert.equal(writes[0].params.p_address.area,'Lake Cocos');
  assert.equal(writes[0].params.p_address.label,'Home','the untouched fields are still sent whole');
  assert.equal(writes[0].params.p_address.is_default,true,'editing an address does not quietly drop its default flag');
  assert.equal(host().querySelector('.address-form'),null);
  assert.equal(calls.filter(call=>call.op==='delete').length,0,'editing never deletes');
});

// P2 — confirmed-deletion keyboard focus. The dialog unmounts and the card actions are disabled
// in one commit, so the destination the shared dialog hands focus back to is inert by the time it
// asks for it. These cases read document.activeElement, not the source.
test('cancelling a deletion returns focus to the Delete button and writes nothing',async()=>{
  fixtures=[savedAddress];
  await mount(manager());
  const opener=cards()[0].querySelector('.delete-btn');
  opener.focus();
  await act(async()=>{opener.click();});
  assert.equal(document.activeElement.textContent,'Cancel','the destructive path is still not the entry point');
  // jsdom fires no native Escape for <dialog>; the cancel event is what the browser would dispatch.
  await act(async()=>{host().querySelector('dialog').dispatchEvent(event('cancel',true));});
  assert.equal(host().querySelector('dialog'),null,'the cancellation event closes the dialog');
  assert.equal(document.activeElement,opener,'cancelling hands focus back to the control that asked');
  assert.equal(opener.disabled,false);
  assert.equal(calls.filter(call=>call.op==='delete').length,0,'and still writes nothing');
});

test('a confirmed deletion parks focus on the section heading while the write runs',async()=>{
  fixtures=[savedAddress,{...savedAddress,id:'addr-2',label:'Work',is_default:false}];
  await mount(manager());
  assert.equal(heading().getAttribute('tabindex'),'-1','the stable destination is script-focusable without joining the tab order');
  const opener=cards()[0].querySelector('.delete-btn');
  opener.focus();
  let release;
  deleteGate=new Promise(resolve=>{release=()=>resolve({error:null});});
  await act(async()=>{opener.click();});
  await act(async()=>{host().querySelector('dialog').querySelectorAll('button')[1].click();});
  assert.equal(host().querySelector('dialog'),null,'the dialog closes as the write starts');
  assert.ok(opener.disabled,'the opener is inert for the duration of the delete');
  assert.equal(document.activeElement,heading(),'the keyboard user stays in the section instead of falling to the document');
  assert.notEqual(document.activeElement,document.body);
  assert.notEqual(document.activeElement,opener,'a disabled control is never handed focus');
  await act(async()=>{release();});
  assert.deepEqual(cards().map(card=>card.dataset.addressId),['addr-2']);
});

test('a successful deletion moves focus onto the address that took the deleted row slot',async()=>{
  fixtures=[savedAddress,{...savedAddress,id:'addr-2',label:'Work',is_default:false},{...savedAddress,id:'addr-3',label:'Hilltop',is_default:false}];
  await mount(manager());
  assert.deepEqual(cards().map(card=>card.dataset.addressId),['addr-1','addr-2','addr-3']);
  const opener=cards()[1].querySelector('.delete-btn');
  opener.focus();
  await act(async()=>{opener.click();});
  await act(async()=>{host().querySelector('dialog').querySelectorAll('button')[1].click();});
  assert.equal(document.activeElement,heading(),'pending');
  await act(async()=>{});
  const remaining=cards();
  assert.deepEqual(remaining.map(card=>card.dataset.addressId),['addr-1','addr-3']);
  assert.equal(document.activeElement,remaining[1].querySelector('.delete-btn'),'focus follows the row that shifted up');
  assert.equal(document.activeElement.disabled,false,'the surviving control can be activated immediately');
  assert.notEqual(document.activeElement,document.body);
});

test('deleting the final address leaves focus on the heading rather than a removed control',async()=>{
  fixtures=[savedAddress];
  await mount(manager());
  const opener=cards()[0].querySelector('.delete-btn');
  opener.focus();
  await act(async()=>{opener.click();});
  await act(async()=>{host().querySelector('dialog').querySelectorAll('button')[1].click();});
  await act(async()=>{});
  assert.equal(cards().length,0);
  assert.match(host().querySelector('.no-addresses').textContent,/No saved addresses yet/);
  assert.equal(document.activeElement,heading(),'with nothing actionable left, the heading is the destination');
  assert.notEqual(document.activeElement,document.body);
  assert.match(host().querySelector('.address-count').textContent,/0 of 5 addresses used/);
});

test('a failed deletion returns focus to the opener so the shopper can retry',async()=>{
  fixtures=[savedAddress];
  await mount(manager());
  const opener=cards()[0].querySelector('.delete-btn');
  opener.focus();
  deleteGate=Promise.resolve({error:{message:'new row violates row-level security policy'}});
  await act(async()=>{opener.click();});
  await act(async()=>{host().querySelector('dialog').querySelectorAll('button')[1].click();});
  assert.equal(document.activeElement,heading(),'the pending destination is used until the write settles');
  await act(async()=>{});
  assert.match(host().querySelector('[role=alert].address-error').textContent,/Could not delete address/,'the failure keeps its announcement');
  assert.equal(opener.disabled,false,'the control is actionable again');
  assert.equal(document.activeElement,opener,'focus lands where the repeated attempt can be made');
  assert.deepEqual(cards().map(card=>card.dataset.addressId),['addr-1'],'nothing was deleted, so the row is still listed');
});

test('a vanished opener falls back to the heading instead of focusing a detached node',async()=>{
  // Models the row being replaced underneath React while the write is in flight: the recorded
  // element is detached and its button is gone, so only the stable destination is left.
  fixtures=[savedAddress];
  await mount(manager());
  const opener=cards()[0].querySelector('.delete-btn');
  opener.focus();
  await act(async()=>{opener.click();});
  await act(async()=>{host().querySelector('dialog').querySelectorAll('button')[1].click();});
  opener.parentElement.removeChild(opener);
  deleteGate=Promise.resolve({error:{message:'the connection closed before the write completed'}});
  await act(async()=>{});
  assert.equal(opener.isConnected,false,'the recorded destination is really gone');
  assert.equal(document.activeElement,heading(),'a detached control must not be the destination');
  assert.notEqual(document.activeElement,document.body);
});
