import {el,button} from './view_adventure.js';
import {createCloseButton} from './view_adventure_controls.js';
import {dungeonFor} from './adventure_dungeons_core.js';
import {monsterArtBinding} from './adventure_monster_art_core.js';
import {tr,setText,fill} from './locale_runtime.js';

function bossPortrait(assets,d){
    const stage=el('div','dungeon-portrait'),fallback=el('span','icon');
    fallback.dataset.uiIcon='dungeon';fallback.setAttribute('aria-hidden','true');stage.append(fallback);
    const binding=monsterArtBinding(d.boss,assets.monsterArt);
    // Portraits when the boss model was rendered; otherwise the pet already used in the world.
    if(!binding||!assets.drawMonster)return stage;
    const canvas=el('canvas','');canvas.width=256;canvas.height=256;
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',d.boss.name);stage.append(canvas);
    const ctx=canvas.getContext('2d');let tries=0;
    const paint=()=>{
        if(!canvas.isConnected)return;
        ctx.clearRect(0,0,256,256);
        if(assets.drawMonster(ctx,d.boss,12,12,232,232)){fallback.hidden=true;return;}
        if(++tries<40)setTimeout(paint,200);
    };
    requestAnimationFrame(paint);return stage;
}

export function renderDungeons(root,{assets,save,dungeonLoading=null},cb){
    root.replaceChildren();root.className='overlay visible';
    const content=assets.content,active=dungeonFor(content,save.zone);
    const modal=el('section','modal wide dungeon-modal');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','副本冒险');
    const header=el('header','modal-header',el('h2','','副本冒险'),createCloseButton(cb.close));
    const body=el('div','modal-body'),toolbar=el('div','dungeon-toolbar'),tabs=el('div','gui-tabs dungeon-tabs');
    const list=el('div','dungeon-list'),footer=el('div','dungeon-pagination');
    let filter='all',page=0;const pageSize=6;
    const filters=[['all','全部副本'],['recommended','适合我'],['progress','进行中']];
    for(const [key,label]of filters){const b=button(label,()=>{filter=key;page=0;draw();});b.dataset.filter=key;tabs.append(b);}
    toolbar.append(tabs,el('p','muted','副本中不会自动回血，进入后需用现有生命通关。'));modal.append(header,toolbar);
    if(active){const cur=el('span','');setText(cur,'正在探索：{name}',{name:active.name});modal.append(el('div','dungeon-current',cur,button('返回探索',cb.close,'secondary'),button('暂离副本',cb.leave,'secondary')));}
    body.append(list);modal.append(body,footer);root.append(modal);
    function draw(){
        list.replaceChildren();footer.replaceChildren();body.scrollTop=0;
        for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.filter===filter));
        const rows=content.dungeons.filter(d=>d.playable&&!/Instance_Test/i.test(d.id))
            .filter(d=>filter==='recommended'?d.recommendedLevel<=(save.level||1)+5:filter==='progress'?!!save.dungeonRuns?.[d.id]&&((save.dungeonRuns[d.id].cleared?.length||0)<d.arenas.length):true)
            .sort((a,b)=>a.recommendedLevel-b.recommendedLevel);
        const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);
        for(const d of rows.slice(page*pageSize,(page+1)*pageSize)){
            const cleared=save.dungeonRuns?.[d.id]?.cleared.length||0,total=d.arenas.length,complete=cleared===total;
            const card=el('article','dungeon-card');
            const picture=bossPortrait(assets,d);const levelTag=el('span','dungeon-level');setText(levelTag,'建议 {level} 级',{level:d.recommendedLevel});picture.append(levelTag);
            const monsters=d.arenas.filter(a=>!a.blocked?.length).flatMap(a=>(a.monsterIds||[]).map(id=>content.monsters[id])).filter(Boolean);
            const rewards=d.battleRewards||{xp:monsters.some(m=>m.xp>0),coins:monsters.some(m=>m.coins>0)};
            const rewardNames=[rewards.xp?tr('经验'):null,rewards.coins?tr('奇豆'):null].filter(Boolean);
            if(rewardNames.length){const sep=tr('、'),joined=rewardNames.join(sep);const reward=el('span','dungeon-rewards',joined);reward.title=fill('战斗奖励：{rewards}',{rewards:joined}).text;picture.append(reward);}
            if(cleared)picture.append(el('span','dungeon-status',complete?'已通关':'探索中'));
            const info=el('div','dungeon-card-info',el('h3','',d.name));
            info.append(el('p','dungeon-boss-name',d.boss?.name||'秘境探索'));
            const actions=el('div','dungeon-actions');
            const enter=button(dungeonLoading===d.id?'正在进入…':active?.id===d.id?'返回探索':save.dungeonRuns?.[d.id]?'继续探索':'进入副本',()=>active?.id===d.id?cb.close():cb.enter(d.id,false),'primary');enter.disabled=!!dungeonLoading;actions.append(enter);
            if(cleared){const restart=button('重新挑战',()=>cb.enter(d.id,true),'secondary');restart.disabled=!!dungeonLoading;actions.append(restart);}
            info.append(actions);card.append(picture,info);list.append(card);
        }
        if(!rows.length)list.append(el('p','dungeon-empty',filter==='progress'?'还没有进行中的副本，选一个开始冒险吧。':'该分类暂无副本。'));
        const prev=button('上一页',()=>{page--;draw();},'secondary'),next=button('下一页',()=>{page++;draw();},'secondary');prev.disabled=page===0;next.disabled=page>=pages-1;
        const status=el('span','',`${page+1} / ${pages}`);status.setAttribute('aria-live','polite');footer.append(prev,status,next);
    }
    draw();
}
