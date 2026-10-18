import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {treeGlossary,treeGloss} from '../js/language_tree_gloss_core.js';
import {tenDictionaryExamples,buildExampleTree} from './fixtures/word-tree-data.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/'+name,import.meta.url))),entries=read('en.json').entries,glossary=treeGlossary(entries,read('tree-glosses.json').meanings);
test('all words in the ten-sentence sample have word-level Chinese meanings',()=>{const s=buildExampleTree(tenDictionaryExamples(entries),entries,0);for(const id of Object.keys(s.words)){assert.notEqual(treeGloss(id,glossary),'释义待补充',id);assert.ok(/[\u3400-\u9fff]/u.test(treeGloss(id,glossary)),id);}assert.equal(treeGloss('help',glossary),'帮助');assert.equal(treeGloss('us',glossary),'我们（宾格）');assert.equal(treeGloss('my',glossary),'我的');});
test('dictionary meanings override supplements, forms share authored meaning, unknown words stay explicit',()=>{const g=treeGlossary([{text:'child',meaning:'孩子',forms:['children']}],{child:'wrong'});assert.equal(treeGloss('Children',g),'孩子');assert.equal(treeGloss('unknown',g),'释义待补充');});
