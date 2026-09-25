import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDialogueMapping,mappingColor} from '../js/dialogue_mapping_core.js';
test('mapping preserves original text, aligns colors and rejects rewritten or unsafe annotations',()=>{
    const word={text:'Go',group:1,kind:'verb',match:'exact'};
    const lines=[{text:'Go!'},{text:'走！'}];
    const result={lines:[[word,{text:'!',group:0,kind:'none',match:'none'}],[{...word,text:'走'},{text:'！',group:0,kind:'none',match:'none'}]]};
    const mapped=validateDialogueMapping(result,lines);
    assert.equal(mappingColor(mapped[0][0]),mappingColor(mapped[1][0]));
    assert.notEqual(mappingColor(word),mappingColor({...word,match:'approximate'}));
    assert.equal(mappingColor(mapped[0][1]),null);
    assert.throws(()=>validateDialogueMapping(result,[{text:'Changed'},lines[1]]));
    assert.throws(()=>validateDialogueMapping({lines:[]},lines));
    assert.throws(()=>validateDialogueMapping({lines:[[{...word,kind:'url(evil)'}]]},[{text:'Go'}]));
});
