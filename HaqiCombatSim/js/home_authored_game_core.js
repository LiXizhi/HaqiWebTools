import {homeWalkBinding} from './home_walking_practice_core.js';
import {HOME_BODY_PARTS,HOME_BODY_ITEM} from './home_body_parts_core.js';
import {HOME_DRAWING_ITEMS,homeDrawingHasMarks} from './home_drawing_core.js';
import {validateHomeStoryArcs} from './home_story_core.js';
import {HOME_COMPARISON_WORDS,HOME_LENGTH_ITEMS,homeComparisonBinding} from './home_comparison_core.js';
import {homeWordReviewDue,homeReviewSessionActive,homeComprehensionReviewDue} from './home_review_core.js';
import {homeComprehensionChoices} from './home_comprehension_core.js';
import {HOME_COUNT_WORDS,homeCountSnapshot} from './home_counting_core.js';
import {HOME_POSITION_WORDS,homePositionBinding} from './home_position_core.js';
import {COLORS} from './home_core.js';
import {canonicalWord,matchWordText} from './word_lexicon_core.js';
import {homePracticeWords,validateHomeGame,homeStoryPetEligible,homeGameAnswer} from './home_language_game_core.js';
import {homePreferenceOptions} from './home_preference_label_core.js';

import {homeNameLabel} from './home_name_label_core.js';

export function validateAuthoredHomeGames(data,index){
    if(data?.version!==1||data.language!==index.language||!Array.isArray(data.games))throw Error('家园故事配置无效');
    if(data.policy&&(!Number.isInteger(data.policy.maxNewWordsPerVisit)||data.policy.maxNewWordsPerVisit<0))throw Error('家园新词预算无效');
    const ids=new Set();
    for(const game of data.games){
        const kind={talk:'talk',jump:'jump',run:'run',stand:'stand',walk:'walk',door:'door',draw:'draw',care:'pet-use',find:'find',arrange:'move',turn:'pet-use',write:'label',read:'find',listen:'find',count:'find',place:'move'}[game.mode];
        if(!game.id||ids.has(game.id)||!kind||game.action?.kind!==kind||(kind==='pet-use'&&!(game.mode==='turn'?['sit','drink','eat','read','ball']:['sit','drink','eat','sleep','ball','read','bathe']).includes(game.action.activity))||!Array.isArray(game.action.itemIds)||!['intro','prompt','answer','reply'].every(k=>typeof game[k]==='string'&&game[k].trim())||!Array.isArray(game.words)||!game.words.length||game.words.length>3)throw Error('家园故事缺少对白、词条或动作');
        if(game.opening!==undefined&&(typeof game.opening!=='string'||!game.opening.trim()))throw Error('家园开场台词不能为空');
        if(['walk','stand','run','jump'].includes(game.mode)&&(game.words.length!==1||game.words[0]!==game.mode||!game.action.itemIds.length))throw Error('走路故事需要明确的 walk 目标和真实目的地');
        if(game.mode==='door'&&(typeof game.action.open!=='boolean'||!game.action.itemIds.length||game.words.length!==1||!['open','close','door'].includes(game.words[0])||(game.words[0]==='open'&&!game.action.open)||(game.words[0]==='close'&&game.action.open)))throw Error('开关门故事需要明确的门动作和目标词');
        if(game.requiresDrawing!==undefined&&(game.requiresDrawing!==true||!(game.mode==='write'||game.mode==='find'&&game.readCharacterLabel)||!game.action.itemIds.length||game.action.itemIds.some(id=>!HOME_DRAWING_ITEMS.includes(id))))throw Error('画作签名需要已保存的真实画纸');
        if(game.listenRequest!==undefined&&(game.listenRequest!==true||index.language!=='en'||game.mode!=='find'||game.words.length!==1||game.words[0]!=='listen'||!['book','ball','cup'].includes(game.requestWord)||game.action.itemIds.length!==1||game.action.itemIds[0]!==game.requestWord||!game.requires?.includes(game.requestWord)||game.requestText!==`Find the ${game.requestWord}.`))throw Error('听请求故事需要listen表达、已学真实物品和明确请求');
        if(game.listenAction!==undefined&&(game.listenAction!==true||!['walk','run','stand','jump'].includes(game.mode)||game.introduces||!game.arcOnly))throw Error('动作口令需要已学动作词及独立故事入口');
        if(game.readCharacterLabel!==undefined&&(game.readCharacterLabel!==true||index.language!=='en'||game.mode!=='find'||!game.requiresDrawing||game.introduces||game.words.length!==1||!['boy','girl','child','person','man','woman','baby'].includes(game.words[0])))throw Error('角色画介绍需要已学人物词、已有画作和真实标签');
        if(game.mode==='draw'&&(game.words.length!==1||game.words[0]!=='draw'||!game.action.itemIds.length||game.action.itemIds.some(id=>!HOME_DRAWING_ITEMS.includes(id))))throw Error('画画故事需要真实画纸和 draw 目标');
        if(game.mode==='turn'&&(!game.pair||![0,1].includes(game.turn)))throw Error('轮流故事缺少配对身份');
        if(game.writing!==undefined&&(index.language!=='en'||game.mode!=='write'||game.words.length!==1||!(game.writing==='name-label'&&game.words[0]==='name'&&homeNameLabel(game.answer)||game.writing==='preference-label'&&game.words[0]==='like'&&/^I like .+\.$/.test(game.answer))))throw Error('写作标签需要匹配的英文 name 或 like 目标与句型');
        if(game.readNameLabel!==undefined&&(game.readNameLabel!==true||index.language!=='en'||game.mode!=='care'||game.action.activity!=='read'||game.words.length!==1||game.words[0]!=='name'||game.writing))throw Error('昵称回访需要读取真实书本标签');
        if(game.requires!==undefined&&(!Array.isArray(game.requires)||new Set(game.requires).size!==game.requires.length||game.requires.some(w=>!canonicalWord(index,w))))throw Error('家园故事前置词无效');
        if(game.action.colors!==undefined&&(!Array.isArray(game.action.colors)||!game.action.colors.length||new Set(game.action.colors).size!==game.action.colors.length||game.action.colors.some(c=>!Object.hasOwn(COLORS,c))))throw Error('家园故事颜色条件无效');
        if(game.bodyRecall!==undefined&&(game.bodyRecall!==true||game.mode!=='find'||!game.action.bodyPart||game.introduces||game.comparison))throw Error('身体部位回忆需要已学目标及明确指认');
        if(game.action.bodyPart!==undefined&&(!(['read','listen'].includes(game.mode)||game.mode==='find'&&game.bodyRecall)||!HOME_BODY_PARTS.includes(game.action.bodyPart)||game.action.itemIds.length!==1||game.action.itemIds[0]!==HOME_BODY_ITEM||game.words.length!==1||game.words[0]!==game.action.bodyPart||game.action.colors))throw Error('身体部位练习需要明确目标和角色画');
        if(game.action.petSpeciesIds!==undefined&&(kind!=='pet-use'||!Array.isArray(game.action.petSpeciesIds)||!game.action.petSpeciesIds.length||new Set(game.action.petSpeciesIds).size!==game.action.petSpeciesIds.length||game.action.petSpeciesIds.some(id=>typeof id!=='string'||!id.trim())))throw Error('动物故事需要明确且唯一的宠物种类');
        if(game.action.petStages!==undefined&&(!game.action.petSpeciesIds||!Array.isArray(game.action.petStages)||!game.action.petStages.length||new Set(game.action.petStages).size!==game.action.petStages.length||game.action.petStages.some(n=>!Number.isInteger(n)||n<0||n>3)))throw Error('动物外观阶段需要已核验的种类与有效阶段');
        if(game.comparison&&(game.mode!=='find'||!HOME_COMPARISON_WORDS.includes(game.comparison.kind)||game.words.length!==1||game.words[0]!==game.comparison.kind||!Array.isArray(game.comparison.anchorItemIds)||!game.comparison.anchorItemIds.length||game.action.colors))throw Error('比较故事需要明确参照物和有效比较目标');
        if(['long','short'].includes(game.comparison?.kind)&&[...game.comparison.anchorItemIds,...game.action.itemIds].some(id=>!HOME_LENGTH_ITEMS.includes(id)))throw Error('长短比较仅使用已核验的笔类道具');
        ids.add(game.id);
        if(game.ending!==undefined&&(typeof game.ending!=='string'||!game.ending.trim()||game.ending.length>600))throw Error('家园故事结尾无效');
        if(game.mode==='talk'&&(typeof game.replyGloss!=='string'||!game.replyGloss.trim()||game.action.itemIds.some(id=>!['book','chair'].includes(id))))throw Error('伙伴对话需要明确回应译文和真实故事角道具');
        if(game.position?.target!==undefined&&(index.language!=='en'||game.mode!=='place'||game.position.kind!=='in'||game.position.target!=='room'))throw Error('房间教学必须绑定真实房间内部摆放');
        if(game.mode==='place'&&(!HOME_POSITION_WORDS.includes(game.position?.kind)||!Array.isArray(game.position.anchorItemIds)||!game.position.anchorItemIds.length||game.words.length!==1||game.words[0]!==(game.position.target||game.position.kind)))throw Error('位置故事缺少明确的位置词或参照物');
        if(game.mode==='count'){
            const target=game.count?.target||'quantity',amount=game.count?.amount,word=target==='quantity'?HOME_COUNT_WORDS[amount-1]:target==='object'?game.count.word:target;
            if(!['quantity','count','number','object'].includes(target)||!Number.isInteger(amount)||amount<1||amount>10||game.words.length!==1||game.words[0]!==word||!game.action.itemIds.length||game.action.colors)throw Error('数数故事必须对应一至十的真实数量');
            if(['number','object'].includes(target)&&(!game.requires?.includes(HOME_COUNT_WORDS[amount-1])||!matchWordText(index,game.answer).some(w=>w.id===HOME_COUNT_WORDS[amount-1])))throw Error('数量报告须使用已经认识的准确数字');
        }
        if(game.mode==='count'&&game.count.target==='object'&&(game.introduces||!game.requires?.includes(game.count.word)))throw Error('物品清点须复习已学物品词');
        if(['read','listen'].includes(game.mode)&&(game.introduces||!game.action.itemIds.length||!game.words.every(w=>matchWordText(index,game.prompt).some(m=>m.id===canonicalWord(index,w)))))throw Error('听读故事必须使用已学物品词和可辨认的真实选择');
        if(['read','listen'].includes(game.mode)&&game.action.colors&&(game.action.colors.length!==1||game.words.length!==1||canonicalWord(index,game.words[0])!==game.action.colors[0]))throw Error('颜色听读需要一个匹配实际标记的明确颜色目标');
        if(index.language==='en'&&['read','listen'].includes(game.mode)&&game.words.some(w=>w!=='orange'&&Object.hasOwn(COLORS,canonicalWord(index,w)))&&!game.action.colors)throw Error('颜色听读不能省略实际颜色条件');
        const words=game.words.map(w=>canonicalWord(index,w)),said=new Set(matchWordText(index,game.answer).map(w=>w.id));
        if(new Set(words).size!==words.length||words.some(w=>!w||!said.has(w)))throw Error('家园故事的目标词不在回应中');
        if(game.alternatives!==undefined&&(!Array.isArray(game.alternatives)||new Set(game.alternatives.map(a=>a.id)).size!==game.alternatives.length||game.alternatives.some(a=>!a.id||typeof a.answer!=='string'||!a.answer.trim()||words.some(w=>!matchWordText(index,a.answer).some(m=>m.id===w)))))throw Error('家园替代表达缺少编号或目标词');
        if(game.alternatives?.some(a=>(a.reply!==undefined||a.replyGloss!==undefined)&&(game.mode!=='talk'||!a.reply?.trim()||!a.replyGloss?.trim()||[game,...game.alternatives.filter(b=>b!==a)].some(b=>homeGameAnswer({answer:b.answer},a.answer)))))throw Error('分支回应需要独立的对话答案与完整译文');
        if(game.introduces!==undefined&&(!Array.isArray(game.introduces)||game.introduces.length!==1||game.introduces.some(w=>!words.includes(canonicalWord(index,w.word))||!w.meaning?.trim()||!game.intro.includes(w.word)||!game.intro.includes(w.meaning))))throw Error('新词故事必须先解释一个明确目标词');
    }
    for(const game of data.games.filter(g=>g.mode==='turn')){
        const pair=data.games.filter(g=>g.mode==='turn'&&g.pair===game.pair);
        if(pair.length!==2||new Set(pair.map(g=>g.turn)).size!==2||pair.some(g=>JSON.stringify(g.action)!==JSON.stringify(game.action)||JSON.stringify(g.words)!==JSON.stringify(game.words)))throw Error('轮流故事必须有同词同动作的两轮');
    }
    return validateHomeStoryArcs(data);
}

export function selectAuthoredHomeGame(data,{mode,index,state,actions,objects,pets=[],played=[],newWordBudget=0,turn=0,continuation=null,countArea=null,catalog=[],arcId=null,now=Date.now()}){
    if(!data||data.language!==index.language)return null;
    if(homeReviewSessionActive(state,now))played=[...(state.homeReviewSession.stories||[]).filter(s=>s.startsWith('home-story:')).map(s=>s.slice(11)),...played];
    const due=homePracticeWords(state,index,Infinity,now),rank=new Map(due.map((id,i)=>[id,i]));
    const candidates=[];
    for(const story of data.games){
        if(story.mode!==mode||(story.arcOnly&&story.arcOnly!==arcId))continue;
        if(mode==='turn'&&(story.turn!==turn||(turn===1&&(!continuation||story.pair!==continuation.pair))))continue;
        if(story.action.kind!=='pet-use'&&!pets.length)continue;
        if((story.requires||[]).some(w=>!rank.has(canonicalWord(index,w))))continue;
        const words=story.words.map(w=>canonicalWord(index,w));
        // Only explicit authored introductions may select an unseen target.
        // Selection still grants no learning evidence; completion does that.
        const unseen=words.filter(w=>!rank.has(w)),introduced=(story.introduces||[]).map(w=>canonicalWord(index,w.word));
        if(unseen.length>newWordBudget||unseen.some(w=>!introduced.includes(w)))continue;
        const counting=mode==='count'?homeCountSnapshot({...story.count,itemIds:story.action.itemIds},objects,countArea,catalog):null;
        if(mode==='count'&&!counting)continue;
        const comparison=story.comparison?homeComparisonBinding({...story.comparison,itemIds:story.action.itemIds},objects,actions):null;
        if(story.comparison&&!comparison)continue;
        const eligible=actions.filter(a=>(!comparison||comparison.targets.some(o=>o.id===a.objectId))&&(!counting||counting.targets.some(o=>o.id===a.objectId))&&(!continuation||mode!=='turn'||turn===0||(a.objectId===continuation.objectId&&a.petId===continuation.petId))&&(!story.action.colors||story.action.colors.includes(objects.find(o=>o.id===a.objectId)?.color))&&a.kind===story.action.kind&&(a.kind!=='door'||a.open===story.action.open)&&a.activity===story.action.activity&&(!story.action.itemIds.length||story.action.itemIds.includes(objects.find(o=>o.id===a.objectId)?.itemId)));
        let action=eligible.find(a=>(!story.requiresDrawing||homeDrawingHasMarks(objects.find(o=>o.id===a.objectId)?.drawing))&&(!story.readCharacterLabel||homeGameAnswer(story,objects.find(o=>o.id===a.objectId)?.label||''))&&(!story.readNameLabel||homeNameLabel(objects.find(o=>o.id===a.objectId)?.label))&&(!story.action.petSpeciesIds||homeStoryPetEligible(story.action,pets.find(p=>p.id===a.petId))));if(!action)continue;
        let position=mode==='place'?homePositionBinding(story.position,action.objectId,objects,catalog):null;
        if(mode==='place'&&!position){for(const candidate of eligible.slice(1)){position=homePositionBinding(story.position,candidate.objectId,objects,catalog);if(position){action=candidate;break;}}if(!position)continue;}
        const comprehension=['read','listen'].includes(mode),choices=comprehension?homeComprehensionChoices(story.action.itemIds,objects,actions,story.action.colors,story.action.bodyPart):null;
        if(comprehension&&!choices)continue;
        const requestChoices=story.listenRequest?homeComprehensionChoices(story.action.itemIds,objects,actions):null;
        if(story.listenRequest&&!requestChoices)continue;
        const skillAt=comprehension||story.listenAction?Math.min(...words.map(w=>state.words[w]?.comprehension?.[story.listenAction?'listen':mode]?.last?.at||0)):null;
        candidates.push({story,words,action,unseen,choices,requestChoices,counting,position,comparison,skillAt,due:!unseen.length&&words.some(w=>comprehension||story.listenAction?homeComprehensionReviewDue(state.words[w],story.listenAction?'listen':mode,now):homeWordReviewDue(state.words[w],now)),rank:Math.min(...words.map(w=>rank.get(w)??Infinity)),last:played.lastIndexOf(story.id)});
    }
    // Due review precedes new targets; within that group prefer unplayed stories.
    // Completed story identities survive reopening the window in the same visit.
    candidates.sort((a,b)=>Number(b.due)-Number(a.due)||Number(a.last>=0)-Number(b.last>=0)||(a.skillAt!==null?a.skillAt-b.skillAt:0)||a.rank-b.rank||a.last-b.last||Number(a.unseen.length>0&&!!a.story.requires?.length)-Number(b.unseen.length>0&&!!b.story.requires?.length)||a.story.id.localeCompare(b.story.id));
    const chosen=candidates[0];if(!chosen)return null;
    const {story,words,action,unseen,choices,requestChoices,counting,position,comparison}=chosen;
    const labeledObject=story.readNameLabel?objects.find(o=>o.id===action.objectId):null;
    const nameLabel=labeledObject?{objectId:labeledObject.id,itemId:labeledObject.itemId,label:labeledObject.label}:null;
    const authored=nameLabel?{...story,answer:homeNameLabel(nameLabel.label).text}:story;
    const characterObject=story.readCharacterLabel?objects.find(o=>o.id===action.objectId):null;
    const characterLabel=characterObject?{objectId:characterObject.id,itemId:characterObject.itemId,label:characterObject.label}:null;
    const bodyCue=story.bodyRecall?{objectId:action.objectId,itemId:HOME_BODY_ITEM,part:story.action.bodyPart}:null;
    const petSpeciesId=story.action.petSpeciesIds?pets.find(p=>p.id===action.petId).speciesId:null;
    const preference=story.writing==='preference-label'?homePreferenceOptions(objects,catalog,state,index):null;
    return {...validateHomeGame({...authored,words,action},{words,actions,index,objects,comparison,pets,petSpeciesId,petStages:story.action.petStages,nameLabel}),walking:['walk','stand','run','jump'].includes(mode)?homeWalkBinding(objects.find(o=>o.id===action.objectId),catalog):null,writing:story.writing,preference,drawingSnapshot:story.requiresDrawing?objects.find(o=>o.id===action.objectId).drawing:null,nameLabel,characterLabel,listenAction:!!story.listenAction,bodyCue,choices,requestChoices,requestText:story.requestText,counting,position,comparison,count:story.count,ending:story.ending,...(petSpeciesId?{petSpeciesId,petStages:story.action.petStages}:{}),...(story.action.colors?{objectColors:story.action.colors}:{}),replyGloss:story.replyGloss,storyId:story.id,pair:story.pair,turn:story.turn,intro:story.intro,opening:story.opening,introducedWords:unseen,alternatives:[...(story.alternatives||[]),...(preference?.alternatives||[])]};
}
