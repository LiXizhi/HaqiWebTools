import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneResolution} from '../js/scene_resolution_core.js';

test('high DPI touch screens bound scene fill cost from the first frame',()=>{
    assert.deepEqual(sceneResolution(3,{coarse:true}),{display:1.25,terrain:1});
    assert.deepEqual(sceneResolution(1,{coarse:true}),{display:1,terrain:1});
    assert.deepEqual(sceneResolution(2),{display:2,terrain:2});
});
test('adaptive quality does not flush terrain textures',()=>{
    for(const coarse of [false,true]){
        assert.equal(sceneResolution(2,{coarse,low:true}).terrain,sceneResolution(2,{coarse}).terrain);
    }
    assert.deepEqual(sceneResolution(NaN),{display:1,terrain:1});
});
