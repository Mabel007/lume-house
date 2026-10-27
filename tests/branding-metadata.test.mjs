import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync,readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');

test('a local, static SVG favicon derived from the brand mark is referenced by the document',()=>{
  assert.ok(existsSync('public/favicon.svg'),'public/favicon.svg must exist');
  const svg=readFileSync('public/favicon.svg','utf8');
  assert.match(svg,/<svg[^>]*viewBox="0 0 64 64"/,'favicon must declare a stable square viewBox');
  assert.match(svg,/fill="#29382e"/,'favicon must use an existing brand colour');
  assert.doesNotMatch(svg,/<script|<animate|<set|<image|url\(|xlink:href|@import/i,'favicon must stay static and self-contained');
  assert.doesNotMatch(svg,/(?:href|src)="https?:/i,'favicon must not reference external resources');
  assert.match(html,/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"\s*\/>/,'index.html must reference the local SVG favicon');
});

test('Open Graph and Twitter text metadata is present without advertising a preview image',()=>{
  assert.match(html,/<meta property="og:site_name" content="Lumé House"\s*\/>/);
  assert.match(html,/<meta property="og:type" content="website"\s*\/>/);
  assert.match(html,/<meta property="og:title" content="Lumé House \| Beautiful things live here\."\s*\/>/);
  assert.match(html,/<meta\s+property="og:description"\s+content="Lumé House\. Beautiful things live here\./);
  assert.match(html,/<meta property="og:url" content="https:\/\/lume\.najbuilds\.com\/"\s*\/>/);
  assert.doesNotMatch(html,/lume-house-delta/,'sharing metadata must identify the approved canonical origin');
  assert.match(html,/<meta name="twitter:card" content="summary"\s*\/>/);
  assert.match(html,/<meta name="twitter:title" content="Lumé House \| Beautiful things live here\."\s*\/>/);
  assert.match(html,/<meta\s+name="twitter:description"\s+content="Lumé House\. Beautiful things live here\./);
  assert.doesNotMatch(html,/<meta[^>]*(?:og:image|twitter:image)/i,'no preview image may be advertised');
});

test('existing document metadata is preserved and no unapproved asset is added',()=>{
  assert.match(html,/<html lang="en">/);
  assert.match(html,/<meta charset="UTF-8" \/>/);
  assert.match(html,/<meta name="viewport" content="width=device-width, initial-scale=1\.0" \/>/);
  assert.match(html,/<meta name="theme-color" content="#f7f5ef" \/>/);
  assert.match(html,/<meta\s+name="description"\s+content="Lumé House\. Beautiful things live here\./);
  assert.match(html,/<title>Lumé House \| Beautiful things live here\.<\/title>/);
  assert.doesNotMatch(html,/rel="manifest"|apple-touch-icon/i,'no unapproved PWA or apple-touch asset');
});
