// Authored bilingual pilot. Re-run only when intentionally refreshing this content.
import fs from 'node:fs';
import {formatLocaleLine} from '../js/locale_core.js';

// Each row contains three question/answer pairs: six expressions per language.
const groups = [
 ['greeting','打招呼',['npc','near-npc'],[
 ['你好！','Hello!','你好，很高兴见到你。','Hello, nice to meet you.'],['你今天好吗？','How are you today?','我很好，谢谢。','I am fine, thank you.'],['我们可以聊聊吗？','Can we talk?','当然可以。','Of course.']]],
 ['introduction','介绍自己',['npc','near-npc'],[
 ['你是新来的吗？','Are you new here?','是的，我是新来的。','Yes, I am new here.'],['你想认识朋友吗？','Would you like to make friends?','我想认识新朋友。','I would like to make new friends.'],['你来自哪里？','Where are you from?','我来自远方。','I come from far away.']]],
 ['help','请求帮助',['npc','near-npc','battle-decision'],[
 ['你需要帮忙吗？','Do you need help?','是的，请帮帮我。','Yes, please help me.'],['你想问什么？','What would you like to ask?','请再说一遍。','Please say that again.'],['我说得太快了吗？','Am I speaking too fast?','请说慢一点。','Please speak more slowly.']]],
 ['thanks','感谢与告别',['npc','battle-end'],[
 ['这有帮助吗？','Does that help?','是的，谢谢你的帮助。','Yes, thank you for your help.'],['你准备离开了吗？','Are you ready to leave?','是的，下次再聊。','Yes, talk to you later.'],['下次还来吗？','Will you come back?','会的，回头见。','Yes, see you later.']]],
 ['identify','认识物品',['inventory','item-selected','item-gained'],[
 ['这是什么？','What is this?','这是{item}。','This is {item}.'],['你能描述这件物品吗？','Can you describe this item?','我看到{item}。','I can see {item}.'],['我们谈谈什么？','What shall we talk about?','我们来谈谈{item}吧。','Let us talk about {item}.']]],
 ['ownership','拥有物品',['inventory','item-selected'],[
 ['你的背包里有什么？','What is in your bag?','我的背包里有{item}。','There is {item} in my bag.'],['你有这样的物品吗？','Do you have an item like this?','是的，我有。','Yes, I do.'],['这是你的吗？','Is this yours?','是的，这是我的。','Yes, it is mine.']]],
 ['quantity','询问数量',['inventory','fish'],[
 ['你有多少这样的物品？','How many of these do you have?','我有{count}{measure}。','I have {count}.'],['只有一个吗？','Is there only one?','让我数一数。','Let me count.'],['你能告诉我数量吗？','Can you tell me the number?','数量是{count}。','The number is {count}.']]],
 ['preference','表达喜好',['inventory','item-selected','npc'],[
 ['你喜欢这件物品吗？','Do you like this item?','是的，我喜欢。','Yes, I like it.'],['你喜欢什么？','What do you like?','我喜欢探索。','I like exploring.'],['你更喜欢哪个？','Which one do you prefer?','我更喜欢这个。','I prefer this one.']]],
 ['choice','作出选择',['item-selected','equipment','npc'],[
 ['你想要哪个？','Which one would you like?','我想要这个。','I would like this one.'],['你确定吗？','Are you sure?','是的，我确定。','Yes, I am sure.'],['为什么选这个？','Why choose this one?','因为它很有用。','Because it is useful.']]],
 ['equipment','谈论装备',['equipment','item-selected'],[
 ['我们看看装备好吗？','Shall we look at the equipment?','好的，让我看看。','Yes, let me have a look.'],['你准备好了吗？','Are you ready?','我准备好了。','I am ready.'],['你想换装备吗？','Would you like to change your equipment?','我想先比较一下。','I would like to compare them first.']]],
 ['location','询问位置',['landmark','npc'],[
 ['我们在哪里？','Where are we?','我们在魔法营地。','We are at the Magic Camp.'],['你想去哪里？','Where would you like to go?','我想去海边。','I would like to go to the beach.'],['你找到这个地方了吗？','Did you find this place?','是的，我找到了。','Yes, I found it.']]],
 ['explore','探索邀请',['landmark','near-npc'],[
 ['我们一起探索吧？','Shall we explore together?','好，我们走吧。','Yes, let us go.'],['你想四处看看吗？','Would you like to look around?','我想四处看看。','I would like to look around.'],['我们要休息一下吗？','Shall we take a break?','好，休息一下吧。','Yes, let us take a break.']]],
 ['directions','澄清路线',['landmark','npc'],[
 ['你知道怎么走吗？','Do you know the way?','请给我指路。','Please show me the way.'],['我们要一起走吗？','Shall we go together?','请跟我来。','Please follow me.'],['你听清楚了吗？','Did you hear me clearly?','你能再解释一下吗？','Could you explain that again?']]],
 ['catch','捕鱼收获',['fish'],[
 ['捕鱼结束了，你想说什么？','Fishing is over. What would you like to say?','我刚才去捕鱼了。','I went fishing just now.'],['你还想捕鱼吗？','Would you like to fish again?','我想再试一次。','I would like to try again.'],['你想先看看收获吗？','Would you like to check your catch first?','我想先看看背包。','I would like to check my bag first.']]],
 ['patience','等待与鼓励',['fish','battle-end'],[
 ['我们再试一次好吗？','Shall we try again?','好的，不要放弃。','Yes, do not give up.'],['你需要一点时间吗？','Do you need a little time?','请等一下。','Please wait a moment.'],['你愿意继续吗？','Would you like to keep going?','我愿意继续尝试。','I would like to keep trying.']]],
 ['prepare','战前准备',['battle-start'],[
 ['你准备开始了吗？','Are you ready to begin?','是的，我们开始吧。','Yes, let us begin.'],['我们先做什么？','What should we do first?','我们先看看卡牌。','Let us look at the cards first.'],['你需要更多时间吗？','Do you need more time?','我需要一点时间。','I need a little time.']]],
 ['protect','保护伙伴',['battle-decision','battle-start'],[
 ['你希望我怎么帮你？','How would you like me to help?','请保护我。','Please protect me.'],['我们需要小心吗？','Should we be careful?','是的，我们要小心。','Yes, we should be careful.'],['你会帮我吗？','Will you help me?','我会帮助你。','I will help you.']]],
 ['strategy','讨论策略',['battle-decision'],[
 ['你想先做什么？','What would you like to do first?','我想先治疗。','I would like to heal first.'],['我们要保存魔力吗？','Should we save our magic?','是的，先保存魔力。','Yes, save our magic first.'],['现在进攻还是等待？','Attack now or wait?','我们先等一等。','Let us wait first.']]],
 ['feelings','关心伙伴',['battle-end','npc'],[
 ['你还好吗？','Are you all right?','我还好，谢谢关心。','I am all right, thank you for asking.'],['你累了吗？','Are you tired?','我想休息一下。','I would like to rest.'],['你现在感觉怎么样？','How do you feel now?','我觉得好多了。','I feel much better.']]],
 ['plans','回顾与计划',['battle-end','item-gained','npc'],[
 ['接下来想做什么？','What would you like to do next?','我想继续探索。','I would like to keep exploring.'],['今天学到什么了？','What did you learn today?','我学会了请求帮助。','I learned how to ask for help.'],['你想分享今天的经历吗？','Would you like to share your day?','我想给你讲个故事。','I would like to tell you a story.']]],
];
const challenges = {
 social:{zh:'我想认识你。请打个招呼，告诉我你喜欢做什么，再邀请我一起做一件事。',en:'I would like to get to know you. Say hello, tell me what you like doing, and invite me to do something together.',goals:[['greet','礼貌问候对方','Greet the partner politely',30],['interest','说明自己喜欢做的事','Describe an activity you enjoy',30],['invite','邀请对方一起做一件具体的事','Invite the partner to a specific shared activity',40]]},
 items:{zh:'我在为探险做准备。请推荐一种物品，说明它有什么用，再问我是否愿意选择它。',en:'I am preparing for an adventure. Recommend an item, explain how it helps, and ask whether I would like it.',goals:[['recommend','推荐一种物品','Recommend an item',30],['reason','解释推荐物品的用途','Explain what the item is useful for',40],['confirm','询问对方是否愿意选择它','Ask whether the partner would like to choose it',30]]},
 travel:{zh:'我想和你一起探索营地。请说出想去哪里，解释为什么，再邀请我同行。',en:'I would like to explore the camp with you. Tell me where you want to go, explain why, and invite me along.',goals:[['place','提出一个想去的地点','Name a place you want to visit',30],['reason','说明去那里的原因','Explain why you want to go there',40],['invite','邀请对方一起前往','Invite the partner to come along',30]]},
 battle:{zh:'我们来讨论下一场战斗。请提出先做什么，解释原因，再问我是否同意。这里只讨论，不会自动出牌。',en:'Let us discuss our next battle. Suggest what to do first, explain why, and ask if I agree. This conversation does not play any cards.',goals:[['plan','提出具体战术行动','Suggest a specific tactical action',30],['reason','解释行动的原因','Explain the reason for that action',40],['confirm','询问伙伴是否同意','Ask whether the partner agrees',30]]},
};
const dictionaries={'zh-CN':{},en:{}};
const variants={greeting:[['你好，很高兴认识你。','Hi, nice to meet you.']],help:[['好的，请帮我一下。','Yes, could you help me, please?']],ownership:[['我背包里有{item}。','I have {item} in my bag.']],quantity:[['一共有{count}{measure}。','There are {count} in total.']]};
const put=(zh,en)=>{if(dictionaries.en[zh]&&dictionaries.en[zh]!==en)throw Error('conflicting source: '+zh);dictionaries['zh-CN'][zh]=zh;dictionaries.en[zh]=en;return zh;};
const courses=groups.map(([id,title,events,rows])=>{
 const type=events.some(e=>e.startsWith('battle'))?'battle':events.includes('inventory')||events.includes('equipment')||events.includes('item-selected')?'items':events.includes('landmark')||events.includes('fish')?'travel':'social';
 const challenge=challenges[type];
 return {id,title,events,requiresItem:['identify','ownership','quantity'].includes(id),tier:['strategy','plans'].includes(id)?'intermediate':'beginner',pairs:rows.map((r,i)=>({id:`${id}.${i+1}`,question:put(r[0],r[1]),answer:put(r[2],r[3]),variants:i===0?(variants[id]||[]).map(([zh,en])=>put(zh,en)):[]})),scenario:put(challenge.zh,challenge.en),goals:challenge.goals.map(([id,zh,en,weight])=>({id,text:put(zh,en),weight}))};
});
const catalog=JSON.parse(fs.readFileSync('data/adventure/npc-catalog.json','utf8'));
const npcs={};
for(const npc of catalog.npcs.filter(n=>n.zone==='camp')){
 npcs[npc.instanceId]=npc.id===36205?['location','directions','explore']:npc.id===36203?['choice','equipment','preference']:npc.id===36202?['greeting','feelings','help']:['greeting','introduction','help','thanks','plans'];
}
const vocabulary=Object.fromEntries([
 ['hat','一顶帽子','顶','a hat'],['wand','一根法杖','根','a wand'],['fish','一条鱼','条','a fish'],['item','一件物品','件','an item'],
 ['robe','一件法袍','件','a robe'],['boots','一双靴子','双','a pair of boots'],['bag','一个卡包','个','a card bag'],
 ['food','一份宠物食物','份','some pet food'],['egg','一颗蛋','颗','an egg'],['card','一张卡牌','张','a card'],
 ['net','一张渔网','张','a fishing net'],['bubble','一个水泡','个','a bubble'],['pearl','一颗魔珠','颗','a magic pearl'],
].map(([id,item,measure,en])=>[id,{'zh-CN':{item,measure},en:{item:en}}]));
const vocabularyBindings={slots:{2:'hat',5:'robe',7:'boots',11:'wand',24:'bag'},kinds:{18:'card'},items:{17114:'bubble',17172:'food',990001:'food',17307:'egg',17487:'pearl'}};
const fishing=JSON.parse(fs.readFileSync('data/adventure/fishing.json','utf8'));
for(const row of Object.values(fishing.items||{}))if(row.name?.endsWith('鱼'))vocabularyBindings.items[row.id]='fish';
for(const net of fishing.nets||[])vocabularyBindings.items[net.id]='net';
const locations=Object.fromEntries(JSON.parse(fs.readFileSync('data/adventure/maps/camp.json','utf8')).landmarks.map(l=>[l.id,['location','directions','explore']]));
fs.writeFileSync('data/adventure/language-courses.json',JSON.stringify({version:1,zone:'camp',languages:{'zh-CN':{content:true,speech:'zh-CN',recognition:true,challenge:true},en:{content:true,speech:'en-US',recognition:true,challenge:true}},courses,npcs,locations,vocabulary,vocabularyBindings},null,2)+'\n');
for(const [locale,table] of Object.entries(dictionaries))fs.writeFileSync(`data/adventure/locale/learning.${locale}.txt`,Object.entries(table).map(([k,v])=>formatLocaleLine(k,v)).join('\n')+'\n');
console.log(`${courses.length} groups, ${courses.reduce((n,c)=>n+c.pairs.length*2,0)} expressions per language; ${Object.keys(npcs).length} NPC bindings`);
