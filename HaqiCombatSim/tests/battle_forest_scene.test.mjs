import test from 'node:test';
import assert from 'node:assert/strict';
import {drawForestCommissionSite} from '../js/view_forest_scene.js';

test('world supplies use real item art and disappear once carried',()=>{
 const draws=[],labels=[],ctx={};
 const assets={content:{items:{1:{art:'boots-art'},2:{art:'hat-art'}}},draw:(...args)=>draws.push(args)};
 const site={forestSite:'boots',name:'补给帐篷',x:50,y:80};
 const appearance={boots:true,hat:true,bootsArt:1,hatArt:2,active:true,label:'补给待领取'};
 drawForestCommissionSite(ctx,assets,site,appearance,(...args)=>labels.push(args));
 assert.deepEqual(draws.map(args=>args[1]),['boots-art','hat-art']);
 assert.equal(labels[0][3],true);
 draws.length=0;drawForestCommissionSite(ctx,assets,site,{...appearance,boots:false},()=>{});
 assert.deepEqual(draws.map(args=>args[1]),['hat-art']);
});

test('route site uses the shipped boulder and hides inactive onboarding props',()=>{
 const draws=[],assets={environmentArt:{draw:(...args)=>draws.push(args)}};
 drawForestCommissionSite({},assets,{forestSite:'note',name:'路线桌',x:100,y:100},{rock:true,label:'石头后面有张便签'},()=>{});
 assert.deepEqual(draws[0].slice(1,3),['campProps','mossBoulder']);
 draws.length=0;drawForestCommissionSite({},assets,{},null,()=>{});assert.equal(draws.length,0);
});
