import test from 'node:test';
import assert from 'node:assert/strict';
import {renderForgeCommission} from '../js/views/adventure/view_forge_commission.js';
import {renderEconomyLedger} from '../js/views/adventure/view_economy_ledger.js';
import {FORGE_SITE} from '../js/forge_commission_core.js';
const now=new Date(2026,10,26,12).getTime();
function view({phase='gather',near=true,pending=false,buff,day='2026-11-26',language='en',teaPractice}={}){
 const nodes=[],calls=[];
 const el=(tag,cls='',...children)=>{const node={tag,className:cls,children,attrs:{},append(...items){this.children.push(...items);},setAttribute(k,v){this.attrs[k]=v;}};nodes.push(node);return node;};
 const button=(label,run,cls)=>Object.assign(el('button',cls,label),{click:run});
 const save={level:8,zone:'camp',position:{x:near?20:1000,y:20},inventory:{100:0},languageLearning:{target:language},forgeCommission:phase==='offer'?undefined:{version:1,phase,gatherDay:day,teaPractice},campfireBuff:buff,pendingEncounter:pending?{}:null};
 const content={balanceParams:{hunt:{level:8,commission:{herbs:3,coins:80,essence:2}}}};
 const root=el('div'),model={save,assets:{content},now,forgeSite:{id:FORGE_SITE,x:20,y:20}};
 const cb={forgeCommission:a=>calls.push(a),forgeTravel:()=>calls.push('travel'),panel:p=>calls.push(p)};
 const before=JSON.stringify(save);renderForgeCommission(root,model,cb,{el,button});assert.equal(JSON.stringify(save),before,'painting never changes progression');
 return {nodes,calls,save,root,el,content,buttons:nodes.filter(n=>n.tag==='button'),text:nodes.flatMap(n=>n.children.filter(v=>typeof v==='string')).join('\n')};
}
test('remote gathering leads to travel while nearby players submit only material intent',()=>{
 const far=view({near:false});assert.equal(far.buttons.length,1);far.buttons[0].click();assert.deepEqual(far.calls,['travel']);
 for(const language of ['en','ja','ko','zh-CN']){
  const ui=view({language});assert.equal(ui.buttons.length,3);
  const herbs=ui.buttons.find(n=>n.attrs['data-forge-choice']==='herb');assert.ok(herbs);herbs.click();
  assert.deepEqual(ui.calls,[{step:'gather',choice:'herb',language}]);assert.match(ui.text,/选错可重试/);
 }
});
test('tea practice submits typed intent in each target language without blocking the main route',()=>{
 for(const language of ['en','ja','ko','zh-CN']){
  const ui=view({phase:'cook',language}),input=ui.nodes.find(n=>n.tag==='input');
  assert.ok(input);assert.equal(input.disabled,false);assert.equal(input.maxLength,80);
  input.value='a real typed label';ui.buttons.find(n=>n.children[0]==='检查标签').click();
  assert.deepEqual(ui.calls,[{step:'practice-tea',language,answer:'a real typed label'}]);
  assert.match(ui.text,/可选/);assert.match(ui.text,/不影响材料、战斗和回信奖励/);
  assert.equal(view({phase:'cook',language,pending:true}).nodes.find(n=>n.tag==='input').disabled,true);
 }
});
test('an incorrect label keeps both completed-commission panels open for retry',()=>{
 for(const language of ['en','ja','ko','zh-CN']){
  const retry=view({phase:'done',language,teaPractice:{[language]:{attempts:1,completed:false}}});
  assert.equal(retry.root.children[0].open,true);
  assert.equal(retry.nodes.find(n=>n.className==='forge-tea-practice').open,true);
  assert.ok(retry.nodes.some(n=>n.tag==='input'&&!n.disabled));
  const done=view({phase:'done',language,teaPractice:{[language]:{attempts:2,completed:true}}});
  assert.equal(done.root.children[0].open,false);
  assert.ok(!done.nodes.some(n=>n.tag==='input'));
 }
 const other=view({phase:'done',language:'ja',teaPractice:{en:{attempts:1}}});
 assert.equal(other.root.children[0].open,false,'another language does not expand the current practice');
});
test('battle blocks every commission action and expired tea never announces readiness',()=>{
 for(const phase of ['offer','gather','cook','challenge','report','done']){
  const ui=view({phase,pending:true,day:'2026-11-25'});assert.ok(ui.buttons.length);assert.ok(ui.buttons.every(b=>b.disabled));
 }
 const expired=view({phase:'challenge',buff:{id:'herbal-dew-tea',remainingBattles:0}});
 assert.ok(expired.buttons.some(b=>b.children[0]==='重新准备轻露茶'));assert.doesNotMatch(expired.text,/准备完成/);
 const ready=view({phase:'challenge',buff:{id:'herbal-dew-tea',remainingBattles:1}});assert.match(ready.text,/准备完成/);
});
test('daily fallback remains discoverable mid-commission and final story promises only the completed battle',()=>{
 for(const phase of ['cook','challenge','report'])assert.match(view({phase,day:'2026-11-25'}).text,/新一天的免费补给/);
 const done=view({phase:'done'});assert.equal(done.root.children[0].tag,'details');assert.match(done.text,/今天已采集/);assert.doesNotMatch(done.text,/重新沿着旧路巡逻/);
});
test('ledger visibly separates repeat income and shows real material costs without treating old stock as income',()=>{
 const ui=view();ui.save.inventory[100]=1000;
 renderEconomyLedger(ui.root,ui.save,ui.content,{el:ui.el});
 assert.ok(ui.nodes.some(n=>n.children.includes('开始采集、制作或挑战后，这里会记下资源流向。')));
 ui.save.economyLedger={version:1,serial:2,totals:{100:{gained:115,spent:40,firstGained:80}},entries:[{serial:1,source:'forge-commission',firstTime:true,changes:[{key:'100',delta:80}]},{serial:2,source:'campfire-cook',firstTime:false,changes:[{key:'pantry:herb',delta:-3},{key:'100',delta:-40}]}]};
 renderEconomyLedger(ui.root,ui.save,ui.content,{el:ui.el});
 const summary=ui.nodes.find(n=>n.className==='economy-summary');assert.ok(summary);
 assert.deepEqual(summary.children.map(n=>n.children.map(c=>c.children[0])),[['奇豆收入','115'],['其中首次奖励','80'],['可重复活动收入','35'],['奇豆支出','40']]);
 assert.ok(ui.nodes.some(n=>n.children.includes('草药 -3，奇豆 -40')));
});
