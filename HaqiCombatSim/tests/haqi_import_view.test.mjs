import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOriginalImport } from '../js/view_haqi_import.js';

class Element {
    constructor(tag) { this.tag=tag;this.children=[];this.style={};this.dataset={};this.attributes={}; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children=nodes; }
    setAttribute(key,value) { this.attributes[key]=value; }
    all() { return [this,...this.children.flatMap(node=>node.all())]; }
    querySelectorAll(tag) { return this.all().filter(node=>node.tag===tag); }
}
test('import preview presents differences safely and only confirms on explicit action', t=>{
    const original=globalThis.document;t.after(()=>{if(original)globalThis.document=original;else delete globalThis.document;});
    globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
    const root=new Element('main');let confirmed=0,closed=0,reads=0;
    const cb={confirm:()=>confirmed++,close:()=>closed++,read:()=>reads++};
    renderOriginalImport(root,{busy:'',preview:null,error:''},cb);
    root.all().find(n=>n.textContent==='授权并读取原服角色').onclick();assert.equal(reads,1);
    renderOriginalImport(root,{busy:'正在读取背包…',preview:null,error:''},cb);
    assert.equal(root.all().some(n=>n.textContent==='确认导入为新角色'),false);
    root.all().find(n=>n.textContent==='取消读取').onclick();assert.equal(closed,1);
    const warning='<img src=x onerror=alert(1)> 未支持';
    const state={busy:'',error:'',preview:{save:{name:'测试',level:12},summary:'装备 1 件',warnings:[warning]}};
    renderOriginalImport(root,state,cb);
    assert.equal(confirmed,0);assert.ok(root.all().some(n=>n.tag==='li'&&n.textContent===warning));
    assert.equal(root.all().some(n=>n.tag==='img'),false);
    root.all().find(n=>n.textContent==='确认导入为新角色').onclick();assert.equal(confirmed,1);
    state.busy='正在保存…';renderOriginalImport(root,state,cb);
    assert.equal(root.all().find(n=>n.textContent==='确认导入为新角色').disabled,true);
    root.all().find(n=>n.attributes['aria-label']==='取消角色导入').onclick();assert.equal(closed,2);
    state.committing=true;renderOriginalImport(root,state,cb);
    assert.ok(root.querySelectorAll('button').every(n=>n.disabled));
});
