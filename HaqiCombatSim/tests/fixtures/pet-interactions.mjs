import {installExpansion} from '../../js/adventure_expansion_core.js';
import {createPetInstance,petPairStatus,petDisplayScale} from '../../js/adventure_pet_interactions_core.js';
import {createPetRepository} from '../../js/adventure_pet_repository.js';
import {createPetIndexedDB} from '../../js/adventure_pet_indexeddb.js';
import {createPetInteractionService} from '../../js/adventure_pet_interaction_service.js';

const $=id=>document.getElementById(id),DAY=86400000,ids=['preview-hero','preview-npc-a','preview-npc-b'];
const scope='fixture-pet-interactions-v1',adapter=createPetIndexedDB({scope,databaseName:'haqi-pet-interactions-fixture-v1'});
const stats={reads:0,writes:0},io={...adapter,read:async path=>{stats.reads++;return adapter.read(path);},write:async(path,value)=>{stats.writes++;return adapter.write(path,value);}};
const read=async path=>{const r=await fetch(new URL('../../data/'+path,import.meta.url));if(!r.ok)throw Error('目录加载失败');return r.json();};
const data=await Promise.all(['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
const {content}=installExpansion(...data),repository=createPetRepository({io,scope,content}),service=createPetInteractionService({repository,content});
let now=Number(sessionStorage.getItem(scope+'.clock'))||Date.UTC(2026,8,27,2),busy=false;
const scene={zone:'camp',distance:20,anchor:{x:100,y:100},walkable:true};
const names=['我的宠物','NPC小火的宠物','NPC小冰的宠物'];
function sprite(pet){const node=document.createElement('div'),art=content.pets[pet.speciesId].art;node.className='sprite';node.style.backgroundImage=`url("${art.cdn}")`;node.style.backgroundPosition=`0 ${pet.level>=25?200/3:0}%`;return node;}
async function paint(){
    const rows=await repository.getMany(ids);$('pets').replaceChildren();
    const pair=petPairStatus(rows[0].pet,rows[1].pet,{now,scene},content);
    for(let i=0;i<rows.length;i++){
        const pet=rows[i].pet,card=document.createElement('div');card.className='pet';card.dataset.id=pet.id;
        
        const art=sprite(pet),title=document.createElement('strong');title.textContent=names[i];title.className='label';
        const info=document.createElement('div');info.className='label';info.textContent=`${pet.gender==='male'?'公':'母'} · ${pet.level}级`;
        const marks=document.createElement('div');marks.className='marks';for(let n=0;n<3;n++){const cell=document.createElement('span');cell.className=i<2&&n<Math.min(3,pair.available)?'filled':'';marks.append(cell);}
        marks.setAttribute('aria-label',i<2?`好友印记 ${pair.available}`:'NPC伙伴');
        const state=document.createElement('div');state.className='small';state.textContent=pet.cooldownUntil>now?`冷却 ${Math.ceil((pet.cooldownUntil-now)/3600000)}小时`:i<2?pair.reason:'玩伴';
        card.append(art,title,info,marks,state);$('pets').append(card);
    }
    const babies=await repository.babies('camp');$('babies').replaceChildren();
    for(const row of babies.rows){const b=document.createElement('button');b.className='baby';b.append(sprite(row.pet));const label=document.createElement('span');label.textContent='待领养 · 点击领取';b.append(label);b.onclick=()=>run(async()=>{await service.adopt(row.pet.id,{ownerId:'hero',now,zone:'camp'});return '领养成功，宝宝已进入战宠背包';});$('babies').append(b);}
    if(!babies.rows.length)$('babies').textContent='宝宝会在这里出现';
    $('bag').replaceChildren();const head=await repository.head();
    for(let page=0;page<head.pages.length;page++)for(const row of (await repository.listPage(page)).rows){if(row.ownerId!=='hero'||ids.includes(row.id))continue;const pet=(await repository.get(row.id)).pet,card=document.createElement('div');card.className='baby';const art=sprite(pet);art.style.setProperty('--pet-scale',String(petDisplayScale(pet,content)));const label=document.createElement('span');label.textContent=content.pets[pet.speciesId].name;card.append(art,label);$('bag').append(card);}
    $('clock').textContent=`演示时间：${new Date(now).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（北京时间）`;
    $('io').textContent=`文件读取 ${stats.reads} 次 · 写入 ${stats.writes} 次 · 每只宠物独立文件`;
}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('.toolbar button').forEach(b=>b.disabled=true);try{$('status').className='';const message=await fn();await paint();$('status').textContent=typeof message==='string'?message:message.text;if(message.pairs)animate(message.pairs,message.markAdded);}catch(error){$('status').className='error';$('status').textContent=error.message;console.error(error);}finally{busy=false;document.querySelectorAll('.toolbar button').forEach(b=>b.disabled=false);}}
function animate(pairs,marks){for(const id of new Set(pairs.flat())){const card=Array.from($('pets').children).find(node=>node.dataset.id===id);if(!card)continue;card.classList.add('playing');if(marks){const heart=document.createElement('span');heart.className='heart';card.querySelector('.sprite').append(heart);}setTimeout(()=>{card.classList.remove('playing');card.querySelector('.heart')?.remove();},4500);}}
async function interact(pairs,kind){const result=await service.interact({pairs:pairs.map(pair=>({ids:pair,scene})),event:{kind,now,completed:kind!=='proximity'}});const markAdded=result.effects.some(e=>e.markAdded);return {pairs,markAdded,text:result.babies.length?'宝宝出生了，点击即可领养':markAdded?'好友印记 +1':'一起玩耍；今天的印记不重复增加'};}
$('play').onclick=()=>run(()=>interact([[ids[0],ids[1]]],'proximity'));
$('talk').onclick=()=>run(()=>interact([[ids[0],ids[1]]],'owner-dialogue'));

$('feed').onclick=()=>run(()=>interact([[ids[0],ids[1]],[ids[0],ids[2]]],'manual-feed'));
$('next').onclick=()=>run(async()=>{now+=DAY;sessionStorage.setItem(scope+'.clock',String(now));await service.prune(ids,now);return '时间前进一天，请再次互动';});
$('restore').onclick=()=>run(async()=>{repository.evict();return '已从独立实例文件重新读取';});
$('concurrency').onclick=()=>run(async()=>{
    const testScope='fixture-race:'+crypto.randomUUID(),options={scope:testScope,databaseName:'haqi-pet-interactions-fixture-v1'};
    const firstIO=createPetIndexedDB(options),secondIO=createPetIndexedDB(options);
    const first=createPetRepository({io:firstIO,scope:testScope,content}),second=createPetRepository({io:secondIO,scope:testScope,content});
    try{
        const pet=createPetInstance(content,{id:'race-pet',ownerId:'fixture',speciesId:'dragon_green'});
        await first.commit([{pet,expectedPath:null}]);
        const [a,b]=await Promise.all([first.get(pet.id),second.get(pet.id)]);
        a.pet.cooldownUntil=1;b.pet.cooldownUntil=2;
        const results=await Promise.allSettled([first.commit([{pet:a.pet,expectedPath:a.path}]),second.commit([{pet:b.pet,expectedPath:b.path}])]);
        if(results.filter(r=>r.status==='fulfilled').length!==1)throw Error('并发提交未能正确拦截');
        return 'IndexedDB双连接竞争通过：仅一方发布成功，另一方报告冲突';
    }finally{first.close();second.close();await firstIO.close();await secondIO.close();}
});
await run(async()=>{
    if(!(await repository.head()).revision)await repository.commit(ids.map((id,i)=>({pet:createPetInstance(content,{id,ownerId:i?'npc:'+i:'hero',speciesId:['dragon_green','dragon_orange','dragon_purple'][i],xp:9000,gender:i===1?'male':'female'}),expectedPath:null})));
    return '隔离验收已就绪';
});
