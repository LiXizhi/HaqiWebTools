import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemotePresence, presenceAppearance} from '../js/adventure_presence_core.js';

test('remote roster includes existing avatars, interpolates movement, and removes departures',()=>{
    const remote=createRemotePresence();remote.reset('haqi:camp','self');
    remote.receive({type:'entered',roomId:'haqi:camp'},0);
    remote.receive({type:'roster',roomId:'haqi:camp',players:[{id:'self',x:0,y:0},{id:'peer',name:'同伴',x:10,y:20,appearance:{appearance:'girl',bodyId:'dress',name:'同伴'}}]},0);
    assert.equal(remote.actors('haqi:camp',0).length,1);
    assert.equal(remote.actors('haqi:camp',0)[0].profile.bodyId,'dress');
    remote.receive({type:'relay',players:[{id:'peer',x:110,y:20,facing:2}]},1000);
    assert.equal(remote.actors('haqi:camp',1500)[0].position.x,60);
    assert.equal(remote.actors('haqi:camp',1500)[0].moving,true);
    assert.equal(remote.actors('haqi:camp',2000)[0].moving,false);
    remote.receive({type:'left',roomId:'haqi:camp',id:'peer'},2000);
    assert.deepEqual(remote.actors('haqi:camp',2000),[]);
});

test('room transitions discard stale messages and do not invent positions or resurrect peers',()=>{
    const remote=createRemotePresence();remote.reset('haqi:ice','self');
    remote.receive({type:'roster',roomId:'haqi:camp',players:[{id:'old',x:1,y:2}]},0);
    remote.receive({type:'relay',players:[{id:'old',x:1,y:2}]},0);
    remote.receive({type:'entered',roomId:'haqi:ice'},0);
    remote.receive({type:'roster',roomId:'haqi:ice',players:[{id:'new',name:'同伴'}]},0);
    assert.deepEqual(remote.actors('haqi:ice',0),[]);
    remote.receive({type:'relay',players:[{id:'new',x:3,y:4},{id:'old',x:1,y:2}]},0);
    assert.equal(remote.actors('haqi:ice',0).length,1);
    assert.deepEqual(remote.actors('haqi:camp',0),[]);
    remote.reset();assert.deepEqual(remote.actors('haqi:ice',0),[]);
});

test('appearance sends only built-in visual descriptors, never saves or credentials',()=>{
    const appearance=presenceAppearance({name:'同伴',headId:'elf-boy',token:'secret',inventory:{},customHead:{url:'https://external.invalid'},level:5});
    assert.deepEqual(appearance,{name:'同伴',headId:'elf-boy',level:5});
});
