import {awardDailySpeech} from '../js/language_daily_buff_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arenaSeats,arenaBenchPets,arenaDifficulty,emptyArenaRecord,beginArenaRecord,finishArenaRecord,startRedMushroom,playRedMushroom,restoreRedMushroom,settleArenaQuests} from '../js/adventure_red_mushroom_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,playerSpec} from '../js/adventure_core.js';
import {makeSocialSnapshot} from '../js/adventure_social_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {catalogGoalRows} from '../js/adventure_catalog_quests_core.js';
import {createRuntimeStore} from '../js/adventure_runtime_store.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p+'.json',import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter'),read('adventure/combat'),read('adventure/pets'),read('adventure/shop-candidates'),read('kids/cards'),read('kids/charms'));
const save=createAdventure(content),hero=playerSpec(save,content);
const allies=[0,1,2].map(i=>({id:`p${i}`,name:`伙伴${i}`,kind:'companion',snapshot:makeSocialSnapshot(hero,dataset)}));

test('four seats: captain, ordered pets, recruits replace exactly one seat, inactive seats stay empty',()=>{
    const copy=structuredClone(save),pet={id:'first',speciesId:'dragon_green',level:1,deck:hero.deck};
    copy.pets={first:pet,second:{...pet,id:'second'},third:{...pet,id:'third'}};copy.formation=['second','first',null,null];
    const seats=arenaSeats(copy,content,dataset,[null,allies[1]],3);
    assert.equal(seats.length,4);assert.equal(seats[0].id,'hero');assert.equal(seats[1].id,'second');assert.equal(seats[2].profileId,'p1');assert.equal(seats[3],null);
    const replaced=arenaSeats(copy,content,dataset,[allies[0]],2);
    assert.equal(replaced[1].kind,'ally');assert.equal(replaced[2],null);assert.equal(replaced[3],null);
    assert.deepEqual(arenaBenchPets(copy,content,replaced).map(pet=>pet.id),['second','first','third']);
    assert.deepEqual(arenaBenchPets(copy,content,arenaSeats(copy,content,dataset,[],2)).map(pet=>pet.id),['first','third']);
    assert.equal(arenaSeats(copy,content,dataset,[],4)[3].id,'third');
    assert.throws(()=>arenaSeats(copy,content,dataset,[allies[0],allies[0]],3),/重复/);
    assert.deepEqual(copy.formation,['second','first',null,null]);
});
for(const mode of [1,2,3,4])test(`${mode}v${mode}: real full battle and exact replay; source save stays unchanged`,()=>{
    const before=JSON.stringify(save),seats=arenaSeats(save,content,dataset,allies,mode);
    const match=startRedMushroom(dataset,seats,mode,42,{first:true,scale:.65});
    assert.equal(match.arena.sides.near.length,mode);assert.equal(match.arena.sides.far.length,mode);
    assert.ok(match.arena.sides.far[0].maxHp<match.arena.sides.near[0].maxHp);
    const bot=new SimpleBot();
    for(let n=0;n<100&&!match.arena.finished;n++)playRedMushroom(match,match.arena.unitsById.hero.hp>0?bot.pick(match.arena,match.arena.unitsById.hero):{pass:true});
    assert.ok(match.arena.finished);assert.ok(match.replay.actions.length);
    const restored=restoreRedMushroom(dataset,JSON.parse(JSON.stringify(match.replay)));
    assert.deepEqual(restored.arena.events,match.arena.events);assert.equal(restored.arena.winner,match.arena.winner);
    assert.equal(JSON.stringify(save),before);
    const broken=structuredClone(match.replay);broken.actions[0].turns[0].hero={pass:'invalid'};
    assert.throws(()=>restoreRedMushroom(dataset,broken),/战报行动/);
});
test('missing team members and invalid actions cannot start/advance; dead hero can spectate',()=>{
    assert.throws(()=>startRedMushroom(dataset,[hero,null,null,null],3,1,{scale:1}),/补齐/);
    const match=startRedMushroom(dataset,arenaSeats(save,content,dataset,allies,3),3,3,{scale:1});
    assert.throws(()=>playRedMushroom(match,{key:'bad',targetId:'rival0',seq:0}),/有效/);
    assert.equal(match.replay.actions.length,0);match.arena.unitsById.hero.hp=0;
    playRedMushroom(match,{pass:true});assert.ok(match.arena.turn>1);assert.equal(match.replay.actions.length,1);
});
test('short starter decks use visible vitality adjudication and the replay preserves it',()=>{
    const match=startRedMushroom(dataset,arenaSeats(save,content,dataset,[],1),1,5,{scale:1.02});
    const bot=new SimpleBot();while(!match.arena.finished)playRedMushroom(match,bot.pick(match.arena,match.arena.unitsById.hero));
    assert.ok(match.adjudication);assert.ok(['near','far'].includes(match.arena.winner));
    assert.equal(match.arena.events.at(-1).type,'arena_adjudication');
    assert.deepEqual(restoreRedMushroom(dataset,match.replay).adjudication,match.adjudication);
});
test('first game is gentle once per local day; repeated settlement is idempotent; interruption consumes first game',()=>{
    let r=emptyArenaRecord();assert.equal(arenaDifficulty(r,'2026-09-30',1).first,true);
    r=beginArenaRecord(r,{id:'one',day:'2026-09-30',mode:2});
    assert.equal(arenaDifficulty(r,'2026-09-30',1).first,false);
    r=finishArenaRecord(r,'one','win');assert.equal(r.total,1);assert.equal(r.wins,1);
    assert.strictEqual(finishArenaRecord(r,'one','win'),r);
    r=beginArenaRecord(r,{id:'two',day:'2026-09-30',mode:2});
    r=beginArenaRecord(r,{id:'three',day:'2026-09-30',mode:2});
    assert.equal(r.losses,1);assert.equal(r.total,2);
    assert.equal(arenaDifficulty(r,'2026-10-01',1).first,true);
});
test('adaptive difficulty deterministic, bounded, rewards recovery after losses and challenges streaks',()=>{
    let record=emptyArenaRecord();
    for(let i=0;i<30;i++)record=finishArenaRecord(beginArenaRecord(record,{id:String(i),day:'today',mode:1}),String(i),'win');
    assert.equal(record.recent.length,20);
    const hard=arenaDifficulty(record,'today',32);assert.ok(hard.scale>1&&hard.scale<=1.6);
    assert.deepEqual(arenaDifficulty(record,'today',32),hard);
    record.recent=record.recent.map(r=>({...r,result:'loss'}));assert.ok(arenaDifficulty(record,'today',32).scale<1);
    assert.ok(arenaDifficulty(record,'tomorrow',32).scale<=.7);
});
test('quest points and participation are separate, only accepted quests advance',()=>{
    const groups=[20046,20048,52212].map(id=>({kind:'custom',items:[{id,count:100,name:String(id)}]}));
    const q={id:1,groups},s={quests:{1:{accepted:true,claimed:false,progress:{}}},inventory:{}},c={catalogQuests:{quests:[q]},items:{20046:{}}};
    assert.ok(settleArenaQuests(s,c,1,'near'));assert.equal(s.quests[1].progress['custom:20046'],25);
    settleArenaQuests(s,c,2,'far');assert.equal(s.quests[1].progress['custom:52212'],1);assert.equal(s.quests[1].progress['custom:20048'],undefined);
    settleArenaQuests(s,c,2,'draw');assert.equal(s.quests[1].progress['custom:20048'],10);
    assert.equal(catalogGoalRows(s,c,q)[0].value,25);assert.equal(catalogGoalRows(s,c,q)[0].blocked,false);
    assert.equal(settleArenaQuests(s,c,3,'near'),false);
    s.quests[1].claimed=true;assert.equal(settleArenaQuests(s,c,1,'near'),false);
});
test('local store fallback isolates account and character keys, never writes the save',async()=>{
    const store=createRuntimeStore({indexedDB:null}),record=beginArenaRecord(emptyArenaRecord(),{id:'x',day:'today',mode:1});
    store.set('account-a.role-a',record);await store.flush();await store.prepare(['account-a.role-b']);
    assert.equal(store.get('account-a.role-b'),undefined);assert.equal(store.get('account-b.role-a'),undefined);
    assert.deepEqual(store.get('account-a.role-a'),record);assert.equal(save.arenaRecord,undefined);
});

test('opponents mirror human/pet composition and preserve pets and mounted humans in replay',()=>{
    const copy=structuredClone(save);copy.mountId='16032';
    copy.pets={one:{id:'one',speciesId:'dragon_green',level:1,deck:hero.deck},two:{id:'two',speciesId:'dragon_green',level:1,deck:hero.deck}};copy.formation=['one','two',null,null];
    for(const mode of [1,2,3,4]){
        const seats=arenaSeats(copy,content,dataset,mode===4?[null,null,allies[1]]:[],mode);
        const match=startRedMushroom(dataset,seats,mode,31,{scale:1});
        assert.deepEqual(match.replay.far.map(p=>!!p.speciesId),match.replay.near.map(p=>!!p.speciesId));
        for(const [i,p] of match.replay.far.entries()){
            const u=match.arena.sides.far[i];
            if(p.speciesId){assert.equal(p.speciesId,match.replay.near[i].speciesId);assert.equal(u.arenaProfile,undefined);assert.equal(p.mountId,undefined);}
            else assert.equal(u.arenaProfile.mountId,'16032');
        }
        const restored=restoreRedMushroom(dataset,JSON.parse(JSON.stringify(match.replay)));
        assert.deepEqual(restored.arena.sides.far.map(u=>[u.speciesId,u.arenaProfile]),match.arena.sides.far.map(u=>[u.speciesId,u.arenaProfile]));
    }
});

test('daily language bonus affects only local hero and survives arena replay',()=>{
 const s=structuredClone(save);for(let i=0;i<40;i++)awardDailySpeech(s,content,String(i));
 const seats=arenaSeats(s,content,dataset,[],1),match=startRedMushroom(dataset,seats,1,42,{first:true,scale:1});
 assert.equal(match.arena.unitsById.hero.languageBuff.hp,10);
 assert.equal(match.arena.unitsById.rival0.languageBuff,undefined);
 const replay=restoreRedMushroom(dataset,match.replay);assert.equal(replay.arena.unitsById.hero.maxHp,match.arena.unitsById.hero.maxHp);
 assert.equal(playerSpec(s,content).dailyLanguageBuff,undefined);
});
