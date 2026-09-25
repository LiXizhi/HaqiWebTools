import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {createAdventure,applyAction} from '../js/adventure_core.js';
import {renderNpcServices} from '../js/view_adventure_npc.js';

class Element {
    constructor(tag,className='',...children){Object.assign(this,{tag,className,children,dataset:{},listeners:{},isConnected:true,classList:{add(){},contains(){return false;}}});}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    get childNodes(){return this.children;}
    setAttribute(){}
    addEventListener(type,fn){this.listeners[type]=fn;}
    getContext(){return {};}
    remove(){}
    focus(){document.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;this.listeners.close?.();}
    get textContent(){return this.text??this.children.map(n=>typeof n==='string'?n:n.textContent).join('');}
    set textContent(value){this.text=value;this.children=[];}
}
const nodes=root=>[root,...root.children.filter(n=>n instanceof Element).flatMap(nodes)];
test('NPC purchase previews details, cancels safely, confirms once and rechecks balance',()=>{
    const previous=globalThis.document;
    const el=(...args)=>new Element(...args);
    globalThis.document={createElement:el,createElementNS:(_,tag)=>el(tag),querySelectorAll:()=>[],body:el('body')};
    try{
        const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
        const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
        installNpcCatalog(content,read('adventure/npc-catalog.json'));
        const serviceNpc=content.npcCatalog.npcs.find(n=>n.id===30429),save=createAdventure(content);
        save.zone=serviceNpc.zone;save.inventory[17213]=10000;
        const body=el('div'),modal=el('div'),header=el('header'),title=el('h2'),eyebrow=el('span');
        body.closest=()=>modal;modal.querySelector=()=>header;header.querySelector=s=>s==='h2'?title:eyebrow;
        let purchases=0;
        const button=(label,action,cls)=>{const b=el('button',cls,label);b.onclick=action;return b;};
        renderNpcServices(body,{assets:{content,dataset,draw(){}},save,serviceNpc},{action:a=>{purchases++;applyAction(save,content,a);}},{el,button,spellFace:()=>null,art:()=>null});
        const buy=nodes(body).find(n=>n.className?.includes('npc-action')&&!n.disabled);
        const dialog=nodes(body).find(n=>n.tag==='dialog');
        const find=label=>nodes(dialog).find(n=>n.tag==='button'&&n.textContent===label);
        const before=JSON.stringify(save);
        buy.onclick();assert.equal(dialog.open,true);assert.equal(JSON.stringify(save),before);
        assert.match(dialog.textContent,/购买数量：1/);assert.match(dialog.textContent,/仙豆/);
        find('取消').onclick();assert.equal(dialog.open,false);assert.equal(JSON.stringify(save),before);
        buy.onclick();dialog.listeners.keydown({key:'Escape',stopPropagation(){},preventDefault(){}});
        assert.equal(dialog.open,false);assert.equal(JSON.stringify(save),before);assert.equal(document.activeElement,buy);
        buy.onclick();const confirm=find('确认购买');confirm.onclick();confirm.onclick();
        assert.equal(purchases,1);assert.equal(dialog.open,false);assert.notEqual(JSON.stringify(save),before);
        buy.onclick();save.inventory[17213]=0;const blocked=JSON.stringify(save);find('确认购买').onclick();
        assert.equal(purchases,1);assert.equal(find('确认购买').disabled,true);assert.equal(JSON.stringify(save),blocked);
    }finally{globalThis.document=previous;}
});
