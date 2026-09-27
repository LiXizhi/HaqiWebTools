import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLocalMap} from '../js/view_adventure_local_map.js';

class Element {
    constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.events={};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(key,fn){this.events[key]=fn;}
    focus(){}
}
const descendants=node=>[node,...node.children.flatMap(descendants)];
test('map shows current companion positions and dispatches one teleport per marker click',t=>{
    const previous=globalThis.document;
    globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
    t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
    const root=new Element('div'),calls=[],world={w:2000,h:1600,layout:{name:'哈奇岛',regions:[]},landmarks:[]};
    const actors=Array.from({length:16},(_,i)=>({profile:{id:`p${i}`,name:`伙伴${i}`},position:{x:200+i*80,y:300+i*60}}));
    const save={position:{x:100,y:100}},before=structuredClone(save);
    const callbacks={close(){},draw(){},teleportToPosition:(x,y)=>calls.push({x,y})};
    renderLocalMap(root,world,save,callbacks,actors);
    const markers=descendants(root).filter(n=>n.className==='island-map-companion');
    assert.equal(markers.length,16);
    markers.forEach((marker,i)=>{
        assert.equal(marker.tag,'button');assert.equal(marker.type,'button');
        assert.equal(marker.attributes['aria-label'],`传送到伙伴${i}`);
        assert.equal(marker.style.left,`${actors[i].position.x/world.w*100}%`);
        assert.equal(marker.style.top,`${actors[i].position.y/world.h*100}%`);
        marker.onclick();
    });
    assert.deepEqual(calls,actors.map(a=>a.position));
    assert.deepEqual(save,before,'view delegates movement without writing the save');
    renderLocalMap(root,world,save,callbacks);
    assert.equal(descendants(root).filter(n=>n.className==='island-map-companion').length,0);
});
