import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueLearningLines,loadLocaleFiles} from '../js/locale.js';

test('NPC text uses the learning pair independent of UI; Chinese is visible by default and can be hidden',async()=>{
    const source='让我带你享受风驰电掣的感觉吧！';
    await loadLocaleFiles(['en'],async()=>`${source}||Let me take you for a thrilling ride!`);
    const settings={enabled:true,target:'en',native:'zh-CN'};
    assert.deepEqual(dialogueLearningLines(source,settings),[{text:'Let me take you for a thrilling ride!',locale:'en'},{text:source,locale:'zh-CN'}]);
    assert.equal(dialogueLearningLines(source,{...settings,showChinese:false}).length,1);
    assert.equal(dialogueLearningLines(source,{...settings,target:'zh-CN',native:'en'})[0].locale,'zh-CN');
    assert.deepEqual(dialogueLearningLines(source,{enabled:false}),[]);
    assert.deepEqual(dialogueLearningLines('尚未翻译的台词',settings),[{text:'尚未翻译的台词',locale:'zh-CN'}]);
});
