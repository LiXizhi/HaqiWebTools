import {homeWordReviewDue,homeReviewSessionActive} from './home_review_core.js';
import {homeComprehensionChoices} from './home_comprehension_core.js';
import {COLORS} from './home_core.js';
import {canonicalWord,matchWordText} from './word_lexicon_core.js';
import {homePracticeWords,validateHomeGame} from './home_language_game_core.js';

export function validateAuthoredHomeGames(data,index){
    if(data?.version!==1||data.language!==index.language||!Array.isArray(data.games))throw Error('家园故事配置无效');
    if(data.policy&&(!Number.isInteger(data.policy.maxNewWordsPerVisit)||data.policy.maxNewWordsPerVisit<0))throw Error('家园新词预算无效');
    const ids=new Set();
    for(const game of data.games){
        const kind={care:'pet-use',find:'find',arrange:'move',turn:'pet-use',write:'label',read:'find',listen:'find'}[game.mode];
        if(!game.id||ids.has(game.id)||!kind||game.action?.kind!==kind||(kind==='pet-use'&&!(game.mode==='turn'?['sit','drink','eat','read','ball']:['sit','drink','eat','sleep']).includes(game.action.activity))||!Array.isArray(game.action.itemIds)||!['intro','prompt','answer','reply'].every(k=>typeof game[k]==='string'&&game[k].trim())||!Array.isArray(game.words)||!game.words.length||game.words.length>3)throw Error('家园故事缺少对白、词条或动作');
        if(game.mode==='turn'&&(!game.pair||![0,1].includes(game.turn)))throw Error('轮流故事缺少配对身份');
        if(game.requires!==undefined&&(!Array.isArray(game.requires)||new Set(game.requires).size!==game.requires.length||game.requires.some(w=>!canonicalWord(index,w))))throw Error('家园故事前置词无效');
        if(game.action.colors!==undefined&&(!Array.isArray(game.action.colors)||!game.action.colors.length||new Set(game.action.colors).size!==game.action.colors.length||game.action.colors.some(c=>!Object.hasOwn(COLORS,c))))throw Error('家园故事颜色条件无效');
        ids.add(game.id);
        if(['read','listen'].includes(game.mode)&&(game.introduces||game.action.colors||!game.action.itemIds.length||!game.words.every(w=>matchWordText(index,game.prompt).some(m=>m.id===canonicalWord(index,w)))))throw Error('听读故事必须使用已学物品词和可辨认的真实选择');
        const words=game.words.map(w=>canonicalWord(index,w)),said=new Set(matchWordText(index,game.answer).map(w=>w.id));
        if(new Set(words).size!==words.length||words.some(w=>!w||!said.has(w)))throw Error('家园故事的目标词不在回应中');
        if(game.alternatives!==undefined&&(!Array.isArray(game.alternatives)||new Set(game.alternatives.map(a=>a.id)).size!==game.alternatives.length||game.alternatives.some(a=>!a.id||typeof a.answer!=='string'||!a.answer.trim()||words.some(w=>!matchWordText(index,a.answer).some(m=>m.id===w)))))throw Error('家园替代表达缺少编号或目标词');
        if(game.introduces!==undefined&&(!Array.isArray(game.introduces)||game.introduces.length!==1||game.introduces.some(w=>!words.includes(canonicalWord(index,w.word))||!w.meaning?.trim()||!game.intro.includes(w.word)||!game.intro.includes(w.meaning))))throw Error('新词故事必须先解释一个明确目标词');
    }
    for(const game of data.games.filter(g=>g.mode==='turn')){
        const pair=data.games.filter(g=>g.mode==='turn'&&g.pair===game.pair);
        if(pair.length!==2||new Set(pair.map(g=>g.turn)).size!==2||pair.some(g=>JSON.stringify(g.action)!==JSON.stringify(game.action)||JSON.stringify(g.words)!==JSON.stringify(game.words)))throw Error('轮流故事必须有同词同动作的两轮');
    }
    return data;
}

export function selectAuthoredHomeGame(data,{mode,index,state,actions,objects,pets=[],played=[],newWordBudget=0,turn=0,continuation=null,now=Date.now()}){
    if(!data||data.language!==index.language)return null;
    if(homeReviewSessionActive(state,now))played=[...(state.homeReviewSession.stories||[]).filter(s=>s.startsWith('home-story:')).map(s=>s.slice(11)),...played];
    const due=homePracticeWords(state,index,Infinity,now),rank=new Map(due.map((id,i)=>[id,i]));
    const candidates=[];
    for(const story of data.games){
        if(story.mode!==mode)continue;
        if(mode==='turn'&&(story.turn!==turn||(turn===1&&(!continuation||story.pair!==continuation.pair))))continue;
        if(story.action.kind!=='pet-use'&&!pets.length)continue;
        if((story.requires||[]).some(w=>!rank.has(canonicalWord(index,w))))continue;
        const words=story.words.map(w=>canonicalWord(index,w));
        // Only explicit authored introductions may select an unseen target.
        // Selection still grants no learning evidence; completion does that.
        const unseen=words.filter(w=>!rank.has(w)),introduced=(story.introduces||[]).map(w=>canonicalWord(index,w.word));
        if(unseen.length>newWordBudget||unseen.some(w=>!introduced.includes(w)))continue;
        const action=actions.find(a=>(!continuation||mode!=='turn'||turn===0||(a.objectId===continuation.objectId&&a.petId===continuation.petId))&&(!story.action.colors||story.action.colors.includes(objects.find(o=>o.id===a.objectId)?.color))&&a.kind===story.action.kind&&a.activity===story.action.activity&&(!story.action.itemIds.length||story.action.itemIds.includes(objects.find(o=>o.id===a.objectId)?.itemId)));
        if(!action)continue;
        const comprehension=['read','listen'].includes(mode),choices=comprehension?homeComprehensionChoices(story.action.itemIds,objects,actions):null;
        if(comprehension&&!choices)continue;
        candidates.push({story,words,action,unseen,choices,due:!unseen.length&&words.some(w=>homeWordReviewDue(state.words[w],now)),rank:Math.min(...words.map(w=>rank.get(w)??Infinity)),last:played.lastIndexOf(story.id)});
    }
    // Due review precedes new targets; within that group prefer unplayed stories.
    // Completed story identities survive reopening the window in the same visit.
    candidates.sort((a,b)=>Number(b.due)-Number(a.due)||Number(a.last>=0)-Number(b.last>=0)||a.rank-b.rank||a.last-b.last||Number(a.unseen.length>0&&!!a.story.requires?.length)-Number(b.unseen.length>0&&!!b.story.requires?.length)||a.story.id.localeCompare(b.story.id));
    const chosen=candidates[0];if(!chosen)return null;
    const {story,words,action,unseen,choices}=chosen;
    return {...validateHomeGame({...story,words,action},{words,actions,index,objects}),choices,...(story.action.colors?{objectColors:story.action.colors}:{}),storyId:story.id,pair:story.pair,turn:story.turn,intro:story.intro,introducedWords:unseen,alternatives:story.alternatives||[]};
}
