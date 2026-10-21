import test from 'node:test';
import assert from 'node:assert/strict';
import {learningParams} from '../js/language_adventure_core.js';
import {resolveParams} from '../js/combat_params_core.js';

test('learning hot path preserves full resolver defaults and live overrides without reading other groups',()=>{
    for(const version of [undefined,'kids','teen']){
        const params={version,languageAdventure:{greetingDistance:123,customValue:7}};
        const expected=resolveParams({cards:{}},params).languageAdventure;
        const content={balanceParams:params};
        assert.deepEqual(learningParams(content),expected);
        Object.defineProperty(params,'adventure',{get(){throw Error('unrelated group');}});
        assert.deepEqual(learningParams(content),expected);
        params.languageAdventure.greetingDistance=456;
        assert.equal(learningParams(content).greetingDistance,456);
        const first=learningParams(content);first.customValue=99;
        assert.equal(learningParams(content).customValue,7);
    }
    assert.deepEqual(learningParams(),resolveParams({cards:{}},{}).languageAdventure);
});
