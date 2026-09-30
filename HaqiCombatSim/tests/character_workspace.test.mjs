import test from 'node:test';
import assert from 'node:assert/strict';
import {characterProfile,newRelationship,applyAffinity} from '../js/character_relationship_core.js';
import {fakeWorkspace} from './helpers/character_workspace.js';

const profile=id=>characterProfile({id,kind:'companion',name:id,native:'en'});
test('lazy relationship index, immutable data, stale conflict, history and fresh client restore',async()=>{
    const f=fakeWorkspace(),io=await f.workspace.connect('r1');assert.equal(f.reads.length,0);
    let a=await io.save(newRelationship(io.scope,{},profile('a'),0));const b=await io.save(newRelationship(io.scope,{},profile('b'),0));
    f.reads.length=0;assert.deepEqual(await io.load('a'),a);assert.ok(f.reads.every(p=>!p.includes('/peers/b/')));
    const history=await io.archive(a,[{role:'user',text:'old'}]);a=await io.save({...a,history,summary:'记得以前'});
    assert.equal((await io.history(history)).messages[0].text,'old');assert.ok(f.files.get('alice/workspace/'+a.memory).includes('记得以前'));
    await assert.rejects(io.save({...a,revision:null}),/其他窗口/);
    assert.deepEqual(await (await f.workspace.connect('r1')).load('a'),a);
    assert.equal(await (await f.workspace.connect('r2')).load('a'),null);
    await assert.rejects(io.history('roles/other/private.json'),/路径/);
    assert.equal((await io.list()).rows.length>0,true);assert.equal(b.affinity>=0,true);
});
test('failed immutable file write never publishes index and network failures never initialize empty',async()=>{
    const f=fakeWorkspace(),io=await f.workspace.connect('r'),a=await io.save(newRelationship(io.scope,{},profile('a'),0)),head=f.files.get('alice/workspace/roles/r/relationships/index.json');
    f.fail('write');await assert.rejects(io.save({...a,summary:'new'}));assert.equal(f.files.get('alice/workspace/roles/r/relationships/index.json'),head);
    f.fail('read');assert.deepEqual(await io.load('a'),a);const unloaded=await f.workspace.connect('not-loaded');await assert.rejects(unloaded.load('a'));await assert.rejects(io.reserve('x','a',false));
});
test('account quota shared across roles, released errors, membership bypass and account switch protection',async()=>{
    const f=fakeWorkspace(),a=await f.workspace.connect('a'),b=await f.workspace.connect('b');
    await Promise.all([a.reserve('one','npc',false),b.reserve('two','other',false)]);assert.equal(await a.remaining(),0);await assert.rejects(b.reserve('three','other',false),/用完/);
    await a.finish('one','released','2026-09-27');assert.equal(await b.remaining(),1);await b.reserve('three','other',false);await b.reserve('vip','other',true);assert.equal(await a.remaining(),0);
    f.setOwner('bob');await assert.rejects(a.quota(),/账号/);assert.equal(await (await f.workspace.connect('a')).remaining(),2);
});
test('archived events still deduplicate after page rotation',async()=>{
    const f=fakeWorkspace(),io=await f.workspace.connect('r');let row=newRelationship(io.scope,{},profile('a'),0);
    for(let i=0;i<105;i++)row=applyAffinity(row,{eventId:`e${i}`,before:row.affinity,delta:0,after:row.affinity},{eventId:`e${i}`,now:i});
    row=await io.save(row);assert.equal(row.events.length,50);assert.ok(await io.hasEvent(row,'e0'));assert.ok(await io.hasEvent(row,'e104'));assert.equal(await io.hasEvent(row,'absent'),false);
});


test('relationship PUT acknowledgements avoid all write-only file GETs',async()=>{
    const f=fakeWorkspace(),io=await f.workspace.connect('r');
    await io.save(newRelationship(io.scope,{},profile('a'),0));
    assert.equal(f.writes.length,4);
    assert.deepEqual(f.reads,['alice/workspace/roles/r/relationships/index.json']);
});


test('relationship and quota reads reuse acknowledged memory across connections',async()=>{
    const f=fakeWorkspace(),io=await f.workspace.connect('r');
    const a=await io.save(newRelationship(io.scope,{},profile('a'),0));
    await io.reserve('first','a',false);f.reads.length=0;
    assert.deepEqual(await (await f.workspace.connect('r')).load('a'),a);
    await io.finish('first','released','2026-09-27');await io.reserve('second','a',false);
    assert.deepEqual(f.reads,[]);
});
