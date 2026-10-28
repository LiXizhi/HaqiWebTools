import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeObjectWasMoved} from '../js/home_language_game_core.js';
import {canPlace,validateHomePart} from '../js/home_core.js';
import {applyHomeAction} from '../js/home_actions_core.js';
import {homePositionBinding,homePositionCurrent} from '../js/home_position_core.js';
import {homeObjectSurfaceLift} from '../js/view_home_art.js';
import {createHomeBuildingCache} from '../js/home_building_cache.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
const table={id:'table',itemId:'table',x:0,y:1},book={id:'book',itemId:'book',x:1,y:1.5,parentId:'table',underTable:true};
test('under-table space is distinct from tabletop, fully contained and exclusive on the ground',()=>{
 const objects=[table,book];assert.ok(canPlace(book,objects,catalog).ok);
 assert.throws(()=>validateHomePart('chunk',{book:{...book,underTable:'yes'}},catalog),/无效/);validateHomePart('chunk',{table,book},catalog);
 for(const change of [{x:-.1},{y:.9},{sizeScale:2},{parentId:'missing'},{itemId:'chair'},{underTable:'true'},{properties:{surface:'roof'}}])assert.equal(canPlace({...book,...change},objects,catalog).ok,false,JSON.stringify(change));
 assert.equal(canPlace(book,[...objects,{...book,id:'other'}],catalog).ok,false);
 assert.ok(canPlace({...book,id:'top',underTable:false},objects,catalog).ok);
 const rug=catalog.find(i=>i.layer==='ground'&&!i.building);assert.ok(canPlace(book,[...objects,{id:'rug',itemId:rug.id,x:0,y:1}],catalog).ok);
 assert.ok(homeObjectWasMoved([{id:'book',before:{...book,underTable:false},after:book}],'book'));
 assert.equal(homeObjectWasMoved([{id:'book',before:book,after:{...book,rotation:1}}],'book'),false);
 const binding=homePositionBinding({kind:'under',anchorItemIds:['table']},'book',objects,catalog);assert.ok(binding);
 assert.ok(homePositionCurrent(binding,objects,catalog));assert.equal(homePositionCurrent(binding,[table,{...book,underTable:false}],catalog),false);
 assert.equal(homePositionCurrent(binding,[{...table,x:1},book],catalog),false);
 assert.equal(homePositionCurrent(binding,[book],catalog),false);
});
test('moving a table carries under-table children and invalid shrinking is refused',()=>{
 const parts={'chunk:0,0':{table:structuredClone(table),book:structuredClone(book)}};
 applyHomeAction(parts,{type:'move',id:'table',position:{x:4,y:1}},catalog);
 assert.equal(parts['chunk:0,0'].book.x,5);assert.ok(parts['chunk:0,0'].book.underTable);
 assert.throws(()=>applyHomeAction(parts,{type:'resize',id:'table',delta:-.25},catalog),/缩小/);
 applyHomeAction(parts,{type:'recall',id:'table'},catalog);assert.deepEqual(parts['chunk:0,0'],{});
});
test('under-table objects have no surface lift and draw behind their support in cached and live paths',()=>{
 assert.equal(homeObjectSurfaceLift(book,new Map([['table',table]]),catalog),0);
 assert.ok(homeObjectSurfaceLift({...book,underTable:false},new Map([['table',table]]),catalog)>0);
 const cache=createHomeBuildingCache({enabled:false,imageFor:()=>null});try{
 const groups=cache.prepare([table,book],catalog,{x:-200,y:-200,w:800,h:800},1);
 const child=groups.find(g=>g.rows.some(r=>r.o.id==='book')),parent=groups.find(g=>g.rows.some(r=>r.o.id==='table'));assert.ok(child.depth<parent.depth);assert.equal(child.rows[0].lift,0);
 }finally{cache.dispose();}
});
