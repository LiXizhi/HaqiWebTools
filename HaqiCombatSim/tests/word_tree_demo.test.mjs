import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tenDictionaryExamples,buildExampleTree} from './fixtures/word-tree-data.js';
const entries=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/en.json',import.meta.url))).entries;
test('ten existing UI examples produce unique nodes and real repeated-word counts',()=>{const rows=tenDictionaryExamples(entries),s=buildExampleTree(rows,entries,0);assert.equal(rows.length,10);assert.equal(Object.keys(s.words).length,25);assert.equal(Object.keys(s.contexts).length,10);for(const id of ['help','open','please'])assert.equal(s.words[id].count,3);assert.equal(s.words.home.count,2);assert.equal(s.words.help.interval,120000);assert.equal(s.words.help.contexts.length,3);assert.equal(s.words.help.mark,null);assert.equal(s.words.help.evidence.length,0);});
