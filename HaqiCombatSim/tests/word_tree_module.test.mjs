import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {wordTreeDisplayState} from '../js/word_tree_display_core.js';

test('WordTree imports with an older cached lexicon lacking the new display export',()=>{
 const script=`
 import fs from 'node:fs';
 import vm from 'node:vm';
 import assert from 'node:assert/strict';
 const modules=new Map();
 function load(url){
  if(modules.has(url.href))return modules.get(url.href);
  let source=fs.readFileSync(url,'utf8');
  if(url.pathname.endsWith('/word_tree.js')&&process.argv[1]==='old-import'){
   source=source.replace("import {wordTreeDisplayState} from './word_tree_display_core.js';","import {wordTreeDisplayState} from './word_lexicon_core.js';");
  }
  if(url.pathname.endsWith('/word_lexicon_core.js')){
   source=source.split(String.fromCharCode(10)).filter(line=>!line.startsWith('export {wordTreeDisplayState}')).join(String.fromCharCode(10));
   assert.ok(!source.includes('export {wordTreeDisplayState}'));
   assert.ok(!source.includes('export function wordTreeDisplayState'));
  }
  const module=new vm.SourceTextModule(source,{identifier:url.href,initializeImportMeta(meta){meta.url=url.href;}});
  modules.set(url.href,module);return module;
 }
 const root=load(new URL('./js/word_tree.js',import.meta.url));
 await root.link((specifier,ref)=>load(new URL(specifier,ref.identifier)));
 await root.evaluate();
 assert.equal(typeof root.namespace.WordTree,'function');
 `;
 assert.throws(()=>execFileSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script,'old-import'],
  {cwd:new URL('../',import.meta.url),stdio:'pipe'}),/does not provide an export named 'wordTreeDisplayState'/);
 execFileSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script],
  {cwd:new URL('../',import.meta.url),stdio:'pipe'});
});

test('display filtering also accepts the previous cached index shape without displayIds',()=>{
 const state={words:{friend:{id:'friend'},friends:{id:'friends'}}};
 const before=structuredClone(state);
 const display=wordTreeDisplayState(state,{data:{},entries:new Map([['friend',{}]])});
 assert.deepEqual(Object.keys(display.words),['friend']);
 assert.deepEqual(state,before);
});
