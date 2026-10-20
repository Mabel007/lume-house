import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deliveryConfig} from '../src/config/fulfilment.ts';

// Drift guard only. The trusted SQL transaction remains authoritative for the
// committed fee, zone label and total; the TypeScript configuration is the UI
// mirror that must never silently diverge from it.
const migrationsDir=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
const zonePattern=/when\s+'(zone-\d+)'\s+then\s+fee\s*:=\s*(\d+)\s*;\s*zone_label\s*:=\s*'([^']*)'\s*;/g;
const canonical=new Map(deliveryConfig.zones.map(zone=>[zone.id,{fee:zone.fee,label:zone.coverage}]));

function zoneOccurrences(source){
  return [...source.matchAll(zonePattern)].map(match=>[match[1],{fee:Number(match[2]),label:match[3]}]);
}
function sqlSources(){
  return readdirSync(migrationsDir).filter(name=>name.endsWith('.sql')).map(name=>[name,readFileSync(join(migrationsDir,name),'utf8')]);
}

test('TypeScript and every trusted SQL checkout path agree on zone ids, fees and labels', () => {
  assert.ok(canonical.size>=1,'shared configuration defines at least one zone');
  for(const [id,zone] of canonical){
    assert.match(id,/^zone-\d+$/,'zone ids stay canonical');
    assert.ok(Number.isSafeInteger(zone.fee)&&zone.fee>=0,`${id} fee is a safe non-negative minor-unit integer`);
    assert.equal(typeof zone.label,'string');
    assert.ok(zone.label.length>0,`${id} has a customer-facing zone label`);
  }
  const withZones=[];
  for(const [name,source] of sqlSources()){
    const occurrences=zoneOccurrences(source);
    if(occurrences.length===0)continue;
    withZones.push(name);
    const seen=new Set();
    for(const [id,value] of occurrences){
      assert.ok(canonical.has(id),`${name} defines unknown zone ${id}`);
      assert.deepEqual(value,canonical.get(id),`${name} ${id} must match the shared fee and label`);
      seen.add(id);
    }
    assert.deepEqual([...seen].sort(),[...canonical.keys()].sort(),`${name} must define exactly the shared zones`);
  }
  // Both trusted checkout entry points must stay covered by the guard.
  assert.ok(withZones.includes('20261002000400_atomic_checkout_email.sql'),'place_order fee source is guarded');
  assert.ok(withZones.includes('20261005000900_variant_inventory.sql'),'place_variant_order fee source is guarded');
});

test('trusted server city, pickup and rejection contract matches the shared configuration', () => {
  const city=deliveryConfig.serviceCity;
  assert.ok(city.length>0);
  for(const [name,source] of sqlSources()){
    if(zoneOccurrences(source).length===0)continue;
    assert.ok(source.includes(`city := '${city}';`),`${name} enforces the Freetown-only service city`);
    assert.ok(source.includes(`lower(city) <> '${city.toLowerCase()}'`),`${name} rejects unsupported cities case-insensitively`);
    assert.ok(source.includes(`'${deliveryConfig.pickupLocation}'`),`${name} snapshots the shared pickup location`);
    assert.ok(source.includes("raise exception 'INVALID_DELIVERY_ZONE'"),`${name} rejects unknown delivery zones`);
  }
});

test('shared zones stay unique, active and consistently priced for the UI', () => {
  const ids=deliveryConfig.zones.map(zone=>zone.id);
  assert.equal(new Set(ids).size,ids.length,'zone ids are unique');
  const fees=deliveryConfig.zones.map(zone=>zone.fee);
  assert.equal(new Set(fees).size,fees.length,'zone fees are distinct');
  assert.ok(deliveryConfig.zones.every(zone=>zone.active),'all provisional zones are currently offered');
  assert.ok(deliveryConfig.pickupLocation.length>0);
});
