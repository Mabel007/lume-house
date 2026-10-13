import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function luminance(rgb){return rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
test('hero label keeps italic editorial wording and a localized contrast-safe backdrop at every crop',()=>{
 const css=readFileSync('src/styles.css','utf8');const block=css.match(/\.art-label\s*\{([^}]+)\}/)[1];assert.match(block,/font-style: italic/);assert.match(block,/position: absolute/);assert.match(block,/color: #20392e/);assert.match(block,/rgba\(250, 246, 237, \.92\)/);assert.match(block,/max-width: calc\(100% - 24px\)/);assert.match(block,/left: clamp\(12px/);
 const darkestBackdrop=[250,246,237].map(v=>v*.92);const ratio=(luminance(darkestBackdrop)+.05)/(luminance([32,57,46])+.05);assert.ok(ratio>=4.5,`Worst-case contrast ${ratio}`);assert.match(readFileSync('src/features/products/ShopPage.tsx','utf8'),/A place for the everyday\./);
});
