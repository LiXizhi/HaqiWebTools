import test from 'node:test';
import assert from 'node:assert/strict';
import {homeSceneHit} from '../js/home_pointer_core.js';
const hit=(kind,id)=>({kind,id,sx:0,sy:0,sw:100,sh:100});
test('pets and furniture retain interaction over the spawn portal, including normal non-learning mode',()=>{
 const object=hit('object','book'),portal=hit('portal','spawn'),pet=hit('pet','friend'),point={sx:50,sy:50};
 assert.equal(homeSceneHit([object,portal,pet],point),pet);
 assert.equal(homeSceneHit([object,portal],point),object);
 assert.equal(homeSceneHit([portal],point),portal);
 assert.equal(homeSceneHit([portal],{sx:110,sy:0}),undefined);
});
test('other overlap order and transparent object pixels stay unchanged',()=>{
 const back=hit('object','back'),front=hit('object','front'),portal=hit('portal','spawn'),point={sx:50,sy:50};
 assert.equal(homeSceneHit([back,portal,front],point),front);
 front.pixelHit=()=>false;
 assert.equal(homeSceneHit([back,portal,front],point),back);
 assert.equal(homeSceneHit([portal,front],point),portal);
});
