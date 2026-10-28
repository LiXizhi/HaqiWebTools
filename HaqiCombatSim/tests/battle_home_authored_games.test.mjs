import {roomFixture} from './home_room_fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
import {validateAuthoredHomeGames,selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameActionMatches,homeGameAnswer,homeObjectWasMoved} from '../js/home_language_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json');
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const catalog=read('data/adventure/home/catalog.json').items;
const objects=['chair','cup','bread-basket','bed','ball','bathtub','shower','book'].map((itemId,i)=>({id:'object-'+i,itemId,x:i,y:0}));
const actions=homeGameActions('care',objects,[{id:'pet1'}],catalog);
const known=words=>({words:Object.fromEntries(words.map((w,i)=>[canonicalWord(index,w),{lastPractice:{at:i+1}}]))});

test('room teaching uses a real room and explicit room target rather than counting supporting in',()=>{
 const story=data.games.find(g=>g.id==='en-l1-room-book-first'),subset={...data,games:[story],arcs:[]};
 const objects=[{id:'book',itemId:'book',x:3,y:1},...roomFixture()],pets=[{id:'friend'}];
 const args={mode:'place',index,state:known(['book','in']),objects,pets,catalog,actions:homeGameActions('place',objects,pets,catalog),newWordBudget:1};
 const game=selectAuthoredHomeGame(subset,args);assert.deepEqual(game.words,['room']);assert.deepEqual(game.introducedWords,['room']);assert.equal(game.position.kind,'in');
 assert.equal(selectAuthoredHomeGame(subset,{...args,objects:objects.filter(o=>o.id==='book')}),null);
 assert.equal(selectAuthoredHomeGame(subset,{...args,newWordBudget:0}),null);
 const bad=structuredClone(subset);bad.games[0].position.kind='near';assert.throws(()=>validateAuthoredHomeGames(bad,index),/房间教学/);
});

test('authored home stories are executable using real catalog facilities and rotate without model calls',()=>{
    validateAuthoredHomeGames(data,index);
    const state=known([...new Set(data.games.flatMap(g=>g.words))]),played=[];
    const before=structuredClone(state);
    const count=data.games.filter(g=>g.mode==='care'&&!g.arcOnly&&!g.action.petSpeciesIds&&!g.readNameLabel).length;
    for(let i=0;i<count;i++){
        const game=selectAuthoredHomeGame(data,{mode:'care',index,state,actions,objects,played});
        assert.ok(game);assert.ok(!played.includes(game.storyId));played.push(game.storyId);
        assert.ok(homeGameActionMatches(game,game.action));
        assert.ok(!homeGameActionMatches(game,{...game.action,petId:'other'}));
    }
    assert.equal(played.length,count);
    assert.ok(selectAuthoredHomeGame(data,{mode:'care',index,state,actions,objects,played}));
    assert.deepEqual(state,before); // Selecting/showing a story grants no evidence.
});

test('a familiar word alone cannot invent a facility or silently add unseen learning targets',()=>{
    const state=known(['water']);
    assert.equal(selectAuthoredHomeGame(data,{mode:'care',index,state,actions:actions.filter(a=>a.activity==='sit'),objects}),null);
    const game=selectAuthoredHomeGame(data,{mode:'care',index,state,actions,objects});
    assert.deepEqual(game.words,['water']);assert.equal(game.action.objectId,'object-1');
    assert.equal(selectAuthoredHomeGame(data,{mode:'care',index,state:{words:{}},actions,objects}),null);
    assert.equal(selectAuthoredHomeGame(data,{mode:'find',index,state,actions,objects}),null);
    assert.equal(selectAuthoredHomeGame(data,{mode:'care',index:{...index,language:'ja'},state,actions,objects}),null);
});

test('authored targets must occur in the answer and duplicate story identities are rejected',()=>{
    const bad=structuredClone(data);bad.games[0].words=['sister'];
    assert.throws(()=>validateAuthoredHomeGames(bad,index),/目标词/);
    bad.games=[data.games[0],data.games[0]];
    assert.throws(()=>validateAuthoredHomeGames(bad,index));
});

test('new object words require an explicit introduction, available budget, a real object and a companion',()=>{
    const objects=[{id:'my-book',itemId:'book',x:0,y:0}],pets=[{id:'pet1'}],state={words:{}};
    const args={mode:'find',index,state,objects,pets,actions:homeGameActions('find',objects,pets,catalog),newWordBudget:1};
    const game=selectAuthoredHomeGame(data,args);
    assert.equal(game.storyId,'en-l1-find-book');assert.deepEqual(game.introducedWords,['book']);
    assert.ok(homeGameAnswer(game,'The book.'));assert.ok(homeGameAnswer(game,'A book.'));
    assert.ok(!homeGameAnswer(game,'The chair.'));
    assert.equal(game.action.objectId,'my-book');assert.deepEqual(state,{words:{}});
    assert.equal(selectAuthoredHomeGame(data,{...args,newWordBudget:0}),null);
    assert.equal(selectAuthoredHomeGame(data,{...args,pets:[]}),null);
    assert.equal(selectAuthoredHomeGame(data,{...args,actions:[]}),null);
    const learned=known(['book']);
    const arrange=selectAuthoredHomeGame(data,{...args,mode:'arrange',state:learned,newWordBudget:0,actions:homeGameActions('arrange',objects,pets,catalog)});
    assert.equal(arrange.storyId,'en-l1-arrange-book');assert.deepEqual(arrange.introducedWords,[]);
    assert.ok(!homeGameActionMatches(arrange,{kind:'find',objectId:'my-book'}));
    assert.ok(homeGameActionMatches(arrange,{kind:'move',objectId:'my-book'}));
});

test('all object introductions and arrangement scenes bind to real catalog items',()=>{
    const pets=[{id:'pet1'}],state=known(data.games.flatMap(g=>g.words));
    for(const story of data.games.filter(g=>g.mode!=='care')){
        for(const itemId of story.action.itemIds){
            const objects=[{id:'placed',itemId,x:0,y:0,...(story.action.colors?{color:story.action.colors[0]}:{})}];
            if(story.requiresDrawing)objects[0].drawing={version:1,strokes:[{color:'#294734',points:[[100,100],[700,500]]}]};
            if(story.readCharacterLabel)objects[0].label=story.answer;
            if(story.comparison){objects[0].color='red';objects.push({id:'match',itemId,x:2,y:0,color:'red'},{id:'contrast',itemId,x:4,y:0,color:'blue'});}
            if(['big','small','long','short'].includes(story.comparison?.kind)){objects[1].sizeScale=2;objects[2].sizeScale=.5;}
            if(['read','listen'].includes(story.mode)||story.listenRequest)objects.push(story.action.colors?{id:'decoy',itemId,color:story.action.colors[0]==='blue'?'red':'blue',x:3,y:0}:{id:'decoy',itemId:story.action.itemIds.includes('book')?'cup':'book',x:3,y:0});
            if(story.position?.kind==='in')objects.push(...roomFixture());
            if(story.mode==='place'){objects.push({id:'anchor-a',itemId:story.position.anchorItemIds[0],x:3,y:0});if(story.position.kind==='between')objects.push({id:'anchor-b',itemId:story.position.anchorItemIds[0],x:9,y:0});}
            if(story.mode==='count')for(let n=1;n<story.count.amount;n++)objects.push({id:'placed-'+n,itemId,x:n*3,y:0});
            const actions=homeGameActions(story.mode,objects,pets,catalog);
            assert.ok(catalog.some(i=>i.id===itemId),itemId);
            const game=selectAuthoredHomeGame({...data,games:[story]},{mode:story.mode,arcId:story.arcOnly,index,state,objects,pets,actions,catalog,countArea:{x:-1,y:-1,w:40,h:10},turn:story.turn,continuation:story.turn===1?{pair:story.pair,objectId:"placed",petId:"pet1"}:null});
            assert.equal(game?.storyId,story.id,`${story.id}/${itemId}`);
        }
    }
});

test('arranging requires a saved position change, including cross-chunk moves, rather than rotation or removal',()=>{
    const before={id:'book',x:1,y:2,rotation:0};
    assert.equal(homeObjectWasMoved([{id:'book',before,after:{...before,rotation:1}}],'book'),false);
    assert.equal(homeObjectWasMoved([{id:'book',before,after:{...before,x:3}}],'book'),true);
    assert.equal(homeObjectWasMoved([{id:'book',before,after:null},{id:'book',before:null,after:{...before,x:40}}],'book'),true);
    assert.equal(homeObjectWasMoved([{id:'book',before,after:null}],'book'),false);
    assert.equal(homeObjectWasMoved([{id:'other',before,after:{...before,x:3}}],'book'),false);
});

test('a help conversation introduces need only after help was practiced',()=>{
    const subset={...data,games:data.games.filter(g=>g.id==='en-l1-need-companion')};
    const args={mode:'care',index,state:{words:{}},actions,objects,newWordBudget:1};
    assert.equal(selectAuthoredHomeGame(subset,args),null);
    const game=selectAuthoredHomeGame(subset,{...args,state:known(['help'])});
    assert.deepEqual(game.introducedWords,['need']);assert.deepEqual(game.words,['need','help']);
    assert.equal(selectAuthoredHomeGame(subset,{...args,state:known(['help']),newWordBudget:0}),null);
});


test('turn stories keep the same pet and object, require a completed introduction context, and do not substitute a missing partner',()=>{
    const objects=[{id:'book1',itemId:'book'},{id:'book2',itemId:'book'}],pets=[{id:'pet1'},{id:'pet2'}];
    const actions=homeGameActions('turn',objects,pets,catalog);
    const args={mode:'turn',index,state:{words:{}},objects,pets,actions,newWordBudget:1};
    const first=selectAuthoredHomeGame(data,args);
    assert.equal(first.storyId,'en-l1-turn-read-1');assert.deepEqual(first.introducedWords,['read']);
    assert.equal(selectAuthoredHomeGame(data,{...args,newWordBudget:0}),null);
    const continuation={pair:first.pair,objectId:first.action.objectId,petId:first.action.petId};
    assert.equal(selectAuthoredHomeGame(data,{...args,turn:1,continuation}),null);
    const next={...args,state:known(['read']),turn:1,continuation,newWordBudget:0};
    const second=selectAuthoredHomeGame(data,next);
    assert.equal(second.storyId,'en-l1-turn-read-2');assert.deepEqual(second.action,first.action);
    assert.ok(homeGameAnswer(second,'Read, please.'));assert.ok(homeGameAnswer(second,'Please read.'));
    assert.equal(selectAuthoredHomeGame(data,{...next,continuation:null}),null);
    assert.equal(selectAuthoredHomeGame(data,{...next,actions:actions.filter(a=>a.petId!=='pet1')}),null);
    assert.equal(selectAuthoredHomeGame(data,{...next,actions:actions.filter(a=>a.objectId!=='book1')}),null);
    assert.ok(!homeGameActionMatches(second,{...second.action,activity:'sit'}));
    const broken=structuredClone(data);broken.games=broken.games.filter(g=>g.id!=='en-l1-turn-read-2');
    assert.throws(()=>validateAuthoredHomeGames(broken,index),/两轮/);
});


test('action words build on known object words without awarding prerequisite practice',()=>{
    const objects=[{id:'book1',itemId:'book'},{id:'lamp1',itemId:'desk-lamp'}],pets=[{id:'pet1'}];
    const args={mode:'find',index,objects,pets,actions:homeGameActions('find',objects,pets,catalog),newWordBudget:1};
    const subset={...data,games:data.games.filter(g=>g.id==='en-l1-action-find-book')};
    assert.equal(selectAuthoredHomeGame(subset,{...args,state:{words:{}}}),null);
    const state=known(['book']),before=structuredClone(state);
    const game=selectAuthoredHomeGame(subset,{...args,state});
    assert.deepEqual(game.words,['find']);assert.deepEqual(game.introducedWords,['find']);assert.deepEqual(state,before);
    assert.equal(selectAuthoredHomeGame(data,{...args,state,now:100,played:['en-l1-find-book']}).storyId,'en-l1-find-book');
    const recentlyReviewed=structuredClone(state);recentlyReviewed.words.book.homeReview={nextAt:1000};
    assert.equal(selectAuthoredHomeGame(data,{...args,state:recentlyReviewed,now:100,played:['en-l1-find-book']}).storyId,'en-l1-find-lamp');
    const broken=structuredClone(data);broken.games[0].requires=['unknown-entry-for-test'];
    assert.throws(()=>validateAuthoredHomeGames(broken,index),/前置词/);
});


test('meal invitations require prior eating vocabulary and a real eating action; labels require learned meal words',()=>{
    const objects=[{id:'table1',itemId:'table',x:0,y:0}],pets=[{id:'pet1'}];
    for(const word of ['breakfast','lunch','dinner']){
        const subset={...data,games:data.games.filter(g=>g.id.startsWith(`en-l1-meal-${word}-`)||g.id===`en-l1-label-${word}-table`)};
        const args={mode:'care',index,objects,pets,actions:homeGameActions('care',objects,pets,catalog),state:known(['eat']),newWordBudget:1,catalog};
        const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.deepEqual(game.words,[word]);assert.deepEqual(game.introducedWords,[word]);
        assert.equal(selectAuthoredHomeGame(subset,{...args,state:known([])}),null);
        assert.equal(selectAuthoredHomeGame(subset,{...args,newWordBudget:0}),null);
        assert.equal(selectAuthoredHomeGame(subset,{...args,actions:[]}),null);
        assert.ok(homeGameAnswer(game,`${word}, please.`));assert.ok(homeGameAnswer(game,`Let us eat ${word}.`));assert.equal(homeGameAnswer(game,'Food, please.'),false);
        assert.ok(homeGameActionMatches(game,game.action));assert.equal(homeGameActionMatches(game,{...game.action,activity:'drink'}),false);
        const writing={...args,mode:'write',actions:homeGameActions('write',objects,pets,catalog),state:known(['table'])};
        assert.equal(selectAuthoredHomeGame(subset,writing),null);
        const label=selectAuthoredHomeGame(subset,{...writing,state:known(['table',word])});assert.ok(label);
        assert.ok(homeGameActionMatches(label,{...label.action,text:`My ${word} table.`}));
        assert.equal(homeGameActionMatches(label,{...label.action,text:'My table.'}),false);
    }
});
