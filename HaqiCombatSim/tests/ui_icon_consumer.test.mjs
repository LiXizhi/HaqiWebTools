import test from 'node:test';
import assert from 'node:assert/strict';
import {applyUiIcon} from '../js/adventure_ui_art.js';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../data/adventure/ui-art.json',import.meta.url)));
test('single icon consumer preserves atlas coordinates without document/style injection',()=>{
 const fallback={style:{}},element={style:{},children:[fallback]};
 assert.equal(applyUiIcon(element,manifest,'map','local'),true);
 assert.equal(element.style.backgroundSize,'400% 500%');
 assert.ok(Math.abs(parseFloat(element.style.backgroundPosition)-100/3)<1e-10);
 assert.ok(element.style.backgroundPosition.endsWith('% 50%'));
 assert.ok(element.style.backgroundImage.includes(manifest.local));
 assert.equal(fallback.style.visibility,'hidden');
 assert.equal(applyUiIcon(element,manifest,'missing','local'),false);
 assert.throws(()=>applyUiIcon(element,{...manifest,cdn:'https://invalid.example/art.webp'},'map'),/资源地址/);
});
