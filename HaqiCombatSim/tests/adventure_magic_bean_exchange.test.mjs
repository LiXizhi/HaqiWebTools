import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAdventure} from '../js/adventure_core.js';
import {installDragonTotemItems} from '../js/adventure_progression_bonuses_core.js';
import {beijingYmd,magicBeanExchangeQuote,exchangeMagicBeans,magicBeanExchangeText,validateMagicBeanExchange} from '../js/adventure_magic_bean_exchange_core.js';
import {createRoleStore} from '../js/adventure_roles.js';
import {validateRoles,emptyRoles,addRole} from '../js/adventure_roles_core.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name,import.meta.url)));
const content=read('chapter.json'),dataset=read('combat.json');
installDragonTotemItems(content);
const today=Date.parse('2026-09-22T16:00:00.000Z');
const member={isVip:true,expiresAt:'2026-10-02T16:00:00.000Z'};
const id=n=>`12345678-1234-1234-1234-${String(n).padStart(12,'0')}`;

test('first exchange uses Beijing days from today, later exchange starts at the recorded date',()=>{
    assert.equal(beijingYmd(today),'2026-09-23');
    assert.equal(beijingYmd(Date.parse(member.expiresAt)),'2026-10-03');
    const first=magicBeanExchangeQuote(member,null,today);
    assert.deepEqual(first,{days:10,beans:100,until:'2026-10-03'});
    const save=createAdventure(content);
    assert.deepEqual(exchangeMagicBeans(save,content,member,null,today),first);
    assert.equal(save.inventory[984],100);
    const sameDay={isVip:true,expiresAt:'2026-09-23T15:59:59.000Z'};
    assert.equal(magicBeanExchangeQuote(sameDay,null,today).beans,0);
    assert.equal(magicBeanExchangeQuote({isVip:true,expiresAt:'2026-09-23T16:00:00.000Z'},null,today).beans,10);
    const laterNow=Date.parse('2026-10-19T16:00:00.000Z');
    const extended={isVip:true,expiresAt:'2026-11-01T16:00:00.000Z'};
    assert.deepEqual(magicBeanExchangeQuote(extended,{exchangedUntil:'2026-10-03'},laterNow),{days:30,beans:300,until:'2026-11-02'});
    assert.equal(magicBeanExchangeQuote(member,{exchangedUntil:'2026-10-03'},laterNow).beans,0);
    const before=save.inventory[984];
    assert.equal(exchangeMagicBeans(save,content,member,{exchangedUntil:'2026-10-03'},laterNow),null);
    assert.equal(save.inventory[984],before);
    const fromRecord=magicBeanExchangeQuote(member,{exchangedUntil:'2026-01-01'},today);
    assert.equal(fromRecord.days,Math.round((Date.UTC(2026,9,3)-Date.UTC(2026,0,1))/86400000));
    assert.notEqual(fromRecord.days,first.days);
});

test('expired, undated and non-member profiles grant nothing and do not move the record backward',()=>{
    const save=createAdventure(content),before=JSON.stringify(save);
    for(const profile of [{isVip:false,expiresAt:member.expiresAt},{isVip:true,expiresAt:'2026-09-22T15:59:59.000Z'},{isVip:true},{isVip:true,expiresAt:'invalid'}]){
        assert.equal(magicBeanExchangeQuote(profile,null,today).beans,0);
        assert.equal(exchangeMagicBeans(save,content,profile,null,today),null);
    }
    assert.equal(JSON.stringify(save),before);
    assert.throws(()=>magicBeanExchangeQuote(member,{exchangedUntil:'2026-02-31'},today),/兑换记录/);
    assert.deepEqual(validateMagicBeanExchange({exchangedUntil:'2026-10-03',token:'secret'}),{exchangedUntil:'2026-10-03'});
    save.pendingEncounter={id:'battle'};
    assert.throws(()=>exchangeMagicBeans(save,content,member,null,today),/战斗/);
    assert.equal(save.inventory[984],undefined);
});

test('login grants beans once per account, and a later renewal only adds days after the recorded date',()=>{
    const data=new Map();let n=0;
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
    const store=createRoleStore({content,dataset,storage,uuid:()=>id(++n),now:()=>1000+n});
    store.open('alice');
    const first=store.create(createAdventure(content,{name:'一号'}));
    store.create(createAdventure(content,{name:'二号'}));
    store.select(first);
    const save=structuredClone(store.catalog.roles.find(row=>row.id===first).save);
    const quote=exchangeMagicBeans(save,content,member,null,today);
    const stored=store.commitMagicBeanExchange(save,quote.until);
    assert.equal(stored.inventory[984],100);
    assert.equal(store.catalog.magicBeanExchange.exchangedUntil,'2026-10-03');
    assert.equal(store.catalog.roles.find(row=>row.id!==first).save.inventory[984],undefined);
    const reloaded=createRoleStore({content,dataset,storage,uuid:()=>id(++n),now:()=>1000+n});
    reloaded.open('alice');
    assert.equal(reloaded.catalog.magicBeanExchange.exchangedUntil,'2026-10-03');
    assert.throws(()=>reloaded.commitMagicBeanExchange(stored,'2026-10-03'),/不能早于/);
    assert.equal(reloaded.catalog.roles.find(row=>row.id===first).save.inventory[984],100);
    const extended={isVip:true,expiresAt:'2026-11-01T16:00:00.000Z'};
    const next=structuredClone(reloaded.catalog.roles.find(row=>row.id===first).save);
    const again=exchangeMagicBeans(next,content,extended,reloaded.catalog.magicBeanExchange,Date.parse('2026-10-19T16:00:00.000Z'));
    assert.equal(again.beans,300);
    reloaded.commitMagicBeanExchange(next,again.until);
    assert.equal(reloaded.catalog.roles.find(row=>row.id===first).save.inventory[984],400);
    assert.equal(reloaded.catalog.magicBeanExchange.exchangedUntil,'2026-11-02');
    const failed=createRoleStore({content,dataset,storage,uuid:()=>id(++n),now:()=>1000+n});
    failed.open('alice');
    const before=failed.checkpoint();
    storage.setItem=()=>{throw Error('quota');};
    assert.throws(()=>failed.commitMagicBeanExchange(structuredClone(next),'2027-01-01'),/quota/);
    assert.equal(failed.checkpoint(),before);
});

test('account catalog keeps the exchange date and drops unrelated fields',()=>{
    const catalog=addRole(emptyRoles(),id(1),createAdventure(content),100);
    catalog.token='do-not-save';
    catalog.magicBeanExchange={exchangedUntil:'2026-10-03',token:'secret'};
    const clean=validateRoles(catalog,content,dataset);
    assert.equal(clean.token,undefined);
    assert.deepEqual(clean.magicBeanExchange,{exchangedUntil:'2026-10-03'});
    assert.equal(validateRoles(emptyRoles(),content,dataset).magicBeanExchange,undefined);
    assert.throws(()=>validateRoles({...catalog,magicBeanExchange:{exchangedUntil:'yesterday'}},content,dataset),/兑换记录/);
    const text=magicBeanExchangeText({status:'ready',isVip:true,...member},{exchangedUntil:'2026-10-03'},Date.parse('2026-12-01T00:00:00.000Z'));
    assert.match(text,/2026年10月3日/);
    assert.match(magicBeanExchangeText({status:'ready',isVip:true,...member},null,today),/100 魔豆/);
    assert.match(magicBeanExchangeText({status:'guest'},null,today),/登录会员后/);
});
