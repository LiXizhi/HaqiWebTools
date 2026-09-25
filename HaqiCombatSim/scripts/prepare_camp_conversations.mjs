import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {patterns} from './language_patterns.mjs';
import {createWorld} from '../js/adventure_world_core.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const bilingual=(en,zh)=>({en,'zh-CN':zh});
const slots=(thing,action,activity,quality,place)=>Object.fromEntries(['en','zh-CN'].map((lang,i)=>[lang,Object.fromEntries(Object.entries({thing,action,activity,quality,place}).map(([k,v])=>[k,v[i]]))]));
const contexts=[
 ['travel','旅行',['a map','一张地图'],['explore the camp','探索营地'],['exploring the camp','探索营地'],['exciting','令人兴奋'],['the camp gate','营地传送门']],
 ['equipment','装备',['a wand','一根法杖'],['practise magic','练习魔法'],['practising magic','练习魔法'],['useful','有用'],['the academy square','导师广场']],
 ['pet','伙伴',['a pet guide','一本宠物指南'],['care for pets','照顾宠物'],['caring for pets','照顾宠物'],['interesting','有趣'],['the Magic Camp','魔法营地']],
 ['nature','自然',['a notebook','一本笔记本'],['watch the weather','观察天气'],['watching the weather','观察天气'],['relaxing','令人放松'],['the training woods','训练林地']],
 ['friend','朋友',['a picture','一幅画'],['make new friends','结交新朋友'],['making new friends','结交新朋友'],['wonderful','美好'],['the academy square','导师广场']],
 ['practice','练习',['a magic card','一张魔法卡牌'],['protect a friend','保护朋友'],['protecting a friend','保护朋友'],['important','重要'],['the Magic Camp','魔法营地']],
];
const fill=(pair,values)=>Object.fromEntries(Object.entries(pair).map(([lang,text])=>[lang,text.replace(/\{(\w+)\}/g,(_,key)=>{if(!values[lang][key])throw Error('Missing slot '+key);return values[lang][key];})]));
const templates=patterns.flatMap(pattern=>contexts.map(([tag,title,...values])=>({id:`${pattern.id}.${tag}`,patternId:pattern.id,tags:[tag],context:bilingual(`Let us talk about ${values[2][0]}.`,`我们来聊聊${values[2][1]}。`),question:fill(pattern.question,slots(...values)),answer:fill(pattern.answer,slots(...values))})));

// Editorial profiles are educational adaptations grounded in source NPC names,
// descriptions and roles. Objects here are conversation topics, not map props.
const authored=[
 [36200,'nature','a weather notebook','一本天气笔记','watch the clouds','观察云朵','watching the clouds','观察云朵','interesting','有趣','变化的天气','The weather keeps changing. Let us plan a day outside.','天气总在变化。我们来商量户外活动吧。'],
 [36201,'friend','a furniture sketch','一张家具草图','design a chair','设计一把椅子','designing furniture','设计家具','creative','有创意','哥哥的家具设计','My brother designs furniture. What would you like to design?','我哥哥设计家具。我们来聊聊你想设计的东西。'],
 [36202,'pet','a pet guide','一本宠物指南','care for a pet','照顾一只宠物','caring for pets','照顾宠物','rewarding','有成就感','宠物照顾计划','I work with pets. Let us talk about looking after a new friend.','我和宠物打交道。来聊聊怎样照顾一位新伙伴。'],
 [36203,'equipment','a magic robe','一件魔法长袍','compare two robes','比较两件长袍','choosing equipment','挑选装备','useful','有用','挑选探险装备','I sell equipment. Let us discuss what you would like for an adventure.','我是装备商人。我们来聊聊探险时你想选什么。'],
 [36204,'travel','a camp map','一张营地地图','find the camp gate','找到营地传送门','exploring the camp','探索营地','helpful','有帮助','看守者的指路练习','Welcome, adventurer. Let us practise finding our way around the camp.','欢迎，冒险者。来练习认识营地的路线吧。'],
 [36205,'travel','an island map','一张岛屿地图','plan an island trip','计划一次岛屿旅行','visiting islands','游览岛屿','exciting','令人兴奋','船长的旅行邀请','I am Captain Foster. Let us plan a trip before we set off.','我是法斯特船长。我们先商量一次旅行吧。'],
 [36206,'practice','a fire magic card','一张烈火魔法卡牌','practise fire magic','练习烈火魔法','studying fire magic','研究烈火魔法','powerful','强大','伏尔坎的火焰研究','I study fire magic. Tell me how you would like to practise.','我研究烈火魔法。聊聊你想怎样练习吧。'],
 [36207,'practice','an ice magic card','一张寒冰魔法卡牌','protect a teammate','保护一位队友','learning ice magic','学习寒冰魔法','useful','有用','艾米娜的守护课','Ice magic helps us defend our friends. Let us discuss protection.','寒冰魔法帮助我们守护朋友。来聊聊保护队友。'],
 [36208,'practice','a storm magic card','一张风暴魔法卡牌','control storm magic','控制风暴魔法','learning storm magic','学习风暴魔法','exciting','令人兴奋','高登的风暴练习','Storm magic is powerful. Let us think before we use it.','风暴魔法很强大。使用之前先想一想吧。'],
 [36209,'practice','a life magic card','一张生命魔法卡牌','help an injured friend','帮助受伤的朋友','learning healing magic','学习治疗魔法','important','重要','爱丽丝的关怀课','We should care for our friends. Let us talk about helping someone.','我们应该关心朋友。来聊聊怎样帮助别人。'],
 [36210,'practice','a death magic card','一张死亡魔法卡牌','learn about death magic','了解死亡魔法','studying death magic','研究死亡魔法','interesting','有趣','磊奥的魔法误会','Our color is black, but that does not mean we are evil. Ask me about our magic.','我们的颜色是黑色，但这不代表邪恶。来了解我们的魔法吧。'],
 [36211,'practice','a learning notebook','一本学习笔记','learn a new spell','学习一个新法术','learning new spells','学习新法术','rewarding','有成就感','青龙的成长建议','I am here to help you grow. Let us choose something to learn.','我会陪伴你成长。来选一件想学的事情吧。'],
 [36212,'friend','an invitation card','一张邀请卡','tell a funny story','讲一个有趣的故事','telling funny stories','讲有趣的故事','fun','有趣','拉布拉的开心邀请','I am Labrala, the magic clown. Let us make our conversation fun.','我是魔法小丑拉布拉。来聊些开心的事情吧。'],
 [36213,'pet','an orange picture','一张橙子的图片','draw an orange','画一个橙子','drawing oranges','画橙子','fun','有趣','香橙宝宝的名字游戏','My name reminds you of an orange. Let us play a word game.','我的名字让人想到橙子。来玩个词语游戏吧。'],
 [36214,'pet','a pineapple picture','一张菠萝的图片','describe a pineapple','描述一个菠萝','describing fruit','描述水果','interesting','有趣','菠萝小姐的描述游戏','My name reminds you of a pineapple. How would you describe one?','我的名字让人想到菠萝。来试试描述它吧。'],
 [36215,'pet','a strawberry picture','一张草莓的图片','draw a strawberry','画一颗草莓','drawing strawberries','画草莓','relaxing','令人放松','草莓姑娘的绘画话题','My name reminds you of a strawberry. Let us talk about drawing fruit.','我的名字让人想到草莓。聊聊画水果吧。'],
 [36217,'pet','a pear picture','一张梨的图片','describe a pear','描述一个梨','learning fruit words','学习水果单词','useful','有用','鸭梨山大的水果单词','There is a pear in my name. Let us learn a fruit word together.','我的名字里有梨。我们一起学个水果单词吧。'],
 [36218,'pet','a banana picture','一张香蕉的图片','draw a banana','画一根香蕉','drawing bananas','画香蕉','easy','简单','香蕉先生的画画邀请','My name reminds you of a banana. Would you like to talk about drawing?','我的名字让人想到香蕉。来聊聊画画吧。'],
 [36219,'travel','a riding guide','一本骑行指南','plan a fast ride','计划一次快速骑行','riding a tiger','骑老虎','exciting','令人兴奋','霸王虎的速度话题','I love a fast ride. Let us talk about a safe riding plan.','我喜欢疾驰。我们聊聊安全的骑行计划吧。'],
 [36220,'travel','a training plan','一份训练计划','become stronger','变得更强','training with a wolf','和魔狼训练','challenging','有挑战性','魔狼的勇气考验','Wolves respect strength. Tell me how you would like to train.','魔狼尊重强者。说说你想怎样训练吧。'],
 [36221,'travel','a rabbit picture','一张兔子的图片','plan a gentle ride','计划一次轻松骑行','riding a rabbit','骑兔子','relaxing','令人放松','仙兔的轻松出游','Let us imagine a gentle ride together. Where would you like to go?','一起想象一次轻松骑行吧。聊聊你想去哪里。'],
 [36222,'travel','a robot drawing','一张机器人的图画','learn about robots','了解机器人','studying robots','研究机器人','interesting','有趣','机器人的自我介绍','Doctor Dockter made me. Let us talk about robots and what they can do.','我是多克特博士制造的。来聊聊机器人能做什么。'],
 [36223,'practice','a shield drawing','一张盾牌的图画','defend a teammate','守护一位队友','practising defense','练习防御','important','重要','寒冰学员的队友约定','I train to protect teammates. Let us make a practice plan.','我练习保护队友。一起制定练习计划吧。'],
 [36224,'practice','a fire training note','一份烈火训练笔记','try a spell again','再试一次法术','practising fire spells','练习烈火法术','challenging','有挑战性','烈火学员的不放弃练习','We do not give up easily. Let us talk about trying again.','我们不会轻易放弃。来聊聊重新尝试吧。'],
 [36225,'practice','a storm training note','一份风暴训练笔记','make a quick decision','快速作出决定','practising quick decisions','练习快速决策','useful','有用','风暴学员的快速决策','I like quick decisions in battle. Let us discuss a plan first.','我喜欢战斗中迅速决策。我们先讨论一个计划吧。'],
 [36227,'practice','a healing notebook','一本治疗笔记','care for a tired friend','照顾疲惫的朋友','helping friends recover','帮助朋友恢复','rewarding','有成就感','生命学员的恢复计划','Seeing a friend recover makes me happy. How could we help?','看到朋友恢复，我很开心。来聊聊怎样帮忙。'],
 [36228,'practice','a courage journal','一本勇气日记','face a difficult challenge','面对困难的挑战','facing challenges','面对挑战','important','重要','死亡学员的勇气日记','We face difficult challenges. Let us talk about courage and preparation.','我们面对困难的挑战。来聊聊勇气和准备。'],
];
const catalog=read('data/adventure/npc-catalog.json'),map=read('data/adventure/maps/camp.json'),art=read('data/adventure/npc-art.json');
const content=read('data/adventure/chapter.json');content.worldMaps={camp:map};content.npcCatalog=catalog;
const world=createWorld('camp',content);
const placeNames={academy:'the academy square',gate:'the camp gate'};
const profiles=catalog.npcs.filter(n=>n.zone==='camp').map(n=>{
    const row=authored.find(r=>r[0]===n.id);if(!row)throw Error('Missing NPC '+n.name);
    const [,tag,te,tz,ae,az,ge,gz,qe,qz,title,oe,oz]=row;
    const placed=world.npcs.find(p=>p.instanceId===n.instanceId);
    const point=placed?[placed.x,placed.y]:[n.x,n.y];
    const nearby=world.landmarks.filter(l=>point.every(Number.isFinite)).map(l=>({...l,distance:Math.round(Math.hypot(l.x-point[0],l.y-point[1]))})).sort((a,b)=>a.distance-b.distance)[0];
    const place=nearby?[placeNames[nearby.id],nearby.name]:['the Magic Camp','魔法营地'];
    const values=slots([te,tz],[ae,az],[ge,gz],[qe,qz],place);
    const first=tag==='travel'?['p005','p022','p091']:tag==='practice'?['p004','p039','p128']:tag==='pet'?['p002','p024','p093']:tag==='equipment'?['p005','p019','p092']:['p003','p021','p026'];
    const groups=[first,['p062','p044','p091'],['p031','p040','p060']];
    const stories=groups.map((ids,i)=>{
        const opening=i===0?bilingual(oe,oz):i===1?bilingual(`Let us imagine ${ge} at ${place[0]}. We are only making a plan.`,`我们设想在${place[1]}${gz}。先一起商量计划。`):bilingual(`Let us practise how to ask for help when you want to ${ae}.`,`想要${az}时，可以怎样请求帮助？我们练习一下。`);
        const turns=ids.map((id,j)=>{
            const pattern=patterns.find(p=>p.id===id);const template=templates.find(t=>t.patternId===id&&t.tags.includes(tag));
            let question=fill(pattern.question,values);
            if(i===0)question=bilingual(`Thinking about ${ge}, ${question.en[0].toLowerCase()+question.en.slice(1)}`,`说到${gz}，${question['zh-CN']}`);
            if(id==='p062')question=bilingual(`Where would you like to go to ${ae}?`,`你想去哪里${az}？`);
            if(id==='p044')question=bilingual(`How would you ask if we can ${ae} there?`,`你会怎样问我们能不能在那里${az}？`);
            if(id==='p091')question=bilingual(`Why are you interested in ${ge}?`,`你为什么对${gz}感兴趣？`);
            if(i===2&&j===0)question=bilingual(`After our talk about ${ge}, what do you want to do?`,`聊过${gz}之后，你想做什么？`);
            if(id==='p040')question=bilingual(`If you wanted to ${ae}, what would you ask me to teach you?`,`如果想${az}，你会请我教你什么？`);
            if(id==='p060')question=bilingual(`You have had a first try at ${ge}. What would you like to do again?`,`设想你初次尝试了${gz}。你还想再做什么？`);
            return {id:`${n.instanceId}.${i+1}.${j+1}`,templateId:template.id,patternId:id,pattern:pattern.answer.en,hint:`${pattern.title}：围绕“${gz}”回答。`,question,answer:fill(pattern.answer,values),response:bilingual([`We can talk more about ${ge}.`,`That is a clear idea for ${ge}.`,`Now you can tell someone about ${ge}.`][j],[`我们可以继续聊聊${gz}。`,`这是关于${gz}的一个清楚的想法。`,`现在你可以向别人说说${gz}了。`][j])};
        });
        return {id:`${n.instanceId}.story${i+1}`,title:[title,`${n.name}：一起商量目的地`,`${n.name}：开口请求帮助`][i],context:opening['zh-CN'],rewardGroup:['preference','location','help'][i],opening,turns,ending:bilingual(`Thank you! I enjoyed our talk about ${ge}.`,`谢谢！和你聊${gz}很开心。`)};
    });
    const entry=art.entries[art.instances[n.instanceId]?.portrait?.id];
    return {id:n.instanceId,npcId:n.id,name:n.name,role:n.subtitle.replace(/[()]/g,'')||n.name,source:{file:n.source,description:n.description,active:!!placed,position:point.every(Number.isFinite)?point:null,nearby:nearby?{id:nearby.id,name:nearby.name,distance:nearby.distance}:null},portrait:entry?{cdn:entry.cdn,local:entry.local}:null,stories};
});
const hash=createHash('sha256').update(fs.readFileSync('data/adventure/maps/camp.json')).update(fs.readFileSync('data/adventure/npc-catalog.json')).digest('hex');
const outputs={
 'data/adventure/language-patterns.json':{version:1,patterns,templates},
 'data/adventure/camp-conversations.json':{version:1,zone:'camp',sourceHash:hash,profiles},
};
for(const [path,value] of Object.entries(outputs))fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const lines=['# 魔法营地 NPC 双语对话预览','','由 `node scripts/prepare_camp_conversations.mjs` 从作者源生成。NPC身份来自原始居民目录；故事为英语教学改编，谈论的物品不代表已摆放在地图上。','','150个句型、900个带情境的对话模板；27位NPC、81个三轮故事。',''];
for(const p of profiles){lines.push(`## ${p.name} · ${p.role}`,'',`依据：${p.source.description}`,p.source.nearby?`地图参考：${p.source.nearby.name}，直线距离 ${p.source.nearby.distance}。`:'地图无明确坐标时，只使用已知身份，不猜附近物件。','');for(const s of p.stories){lines.push(`### ${s.title}`,'',s.context,'','| 句型 | NPC 问题 | 回答示例 |','| --- | --- | --- |');for(const t of s.turns)lines.push(`| ${t.patternId} | ${t.question.en}<br>${t.question['zh-CN']} | ${t.answer.en}<br>${t.answer['zh-CN']} |`);lines.push('');}}
fs.writeFileSync('docs/camp-conversations.md',lines.join('\n')+'\n');
console.log(`${patterns.length} patterns / ${templates.length} templates / ${profiles.length} NPCs / ${profiles.reduce((sum,p)=>sum+p.stories.length,0)} stories`);
