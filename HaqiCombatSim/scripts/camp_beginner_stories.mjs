// Hand-authored pre-A1 side stories. Quest conditions refer to claimed kids tutorial quests.
const pair=(en,zh)=>({en,'zh-CN':zh});
const turn=(q,zq,a,za,pattern,variants=[])=>({question:pair(q,zq),answer:pair(a,za),pattern,variants:{en:variants,'zh-CN':[]},hint:'可以先听示范，再用自己的话回答。',response:pair('Thank you!','谢谢！')});
const stories={
  36211:[
    ['和导师问好','preference',null,[
      turn('Hello!','你好！','Hello!','你好！','Hello.',['Hi','Hi there']),
      turn('What is your name?','你叫什么名字？','My name is Lily.','我叫小丽。','My name is …',['I am Lily','Lily']),
      turn('Ready?','准备好了吗？','Yes!','准备好了！','Yes.',['Yes I am','Ready','No','Not yet']),
    ]],
    ['认识魔法','location',63000,[
      turn('Do you like magic?','你喜欢魔法吗？','Yes!','喜欢！','I like …',['Yes I do','No','No I do not']),
      turn('Magic or pets?','魔法还是宠物？','I like magic.','我喜欢魔法。','I like …',['Magic','Pets','I like pets']),
      turn('Do you like the camp?','你喜欢营地吗？','I like the camp.','我喜欢营地。','I like …',['Yes','Yes I do','No']),
    ]],
    ['法杖小帮手','help',63006,[
      turn('Need help?','需要帮忙吗？','Help me, please.','请帮帮我。','Help me, please.',['Yes please','Yes','Please help me']),
      turn('With your wand?','是法杖的事情吗？','Yes, please.','是的，谢谢。','Yes, please.',['Yes','My wand','No']),
      turn('Ready to learn?','准备好学习了吗？','Yes!','准备好了！','Yes.',['Ready','Yes I am','Not yet','No']),
    ]],
  ],
  36202:[
    ['认识宠物','preference',null,[
      turn('Do you like pets?','你喜欢宠物吗？','I like pets.','我喜欢宠物。','I like …',['Yes','Yes I do','No','I do not like pets']),
      turn('A dragon or a rabbit?','龙还是兔子？','I like rabbits.','我喜欢兔子。','I like …',['A rabbit','Rabbits','A dragon','I like dragons']),
      turn('Big or small?','大的还是小的？','I like small pets.','我喜欢小宠物。','I like …',['Small','Big','I like big pets']),
    ]],
    ['照顾新伙伴','location',63008,[
      turn('Want to learn about food?','想了解食物吗？','Yes, please.','好的，谢谢。','I want …',['Yes','No','Not now']),
      turn('Food or water?','食物还是水？','I want food.','我想要食物。','I want …',['Food','Water','I want water']),
      turn('Want help?','想要帮助吗？','I want help.','我想要帮助。','I want …',['Yes please','Help me please','No thanks']),
    ]],
    ['聊聊伙伴','help',63009,[
      turn('Do you like your pet?','你喜欢你的宠物吗？','I like my pet.','我喜欢我的宠物。','I like …',['Yes','Yes I do','No']),
      turn('What do you like?','你喜欢什么？','I like rabbits.','我喜欢兔子。','I like …',['Rabbits','Dragons','I like dragons']),
      turn('Do you like small pets?','你喜欢小宠物吗？','Yes!','喜欢！','I like …',['Yes I do','No','I like big pets']),
    ]],
  ],
  36205:[
    ['请船长帮忙','help',null,[
      turn('Need help?','需要帮忙吗？','Help me, please.','请帮帮我。','Help me, please.',['Yes please','Yes','Please help me']),
      turn('A map?','要地图吗？','A map, please.','请给我一张地图。','… please.',['Yes','Yes please','A map','No thanks']),
      turn('The camp map?','营地的地图吗？','Yes, please.','是的，谢谢。','Yes, please.',['Yes','No']),
    ]],
    ['认识营地','location',63000,[
      turn('Looking for the camp?','在找营地吗？','Where is the camp?','营地在哪里？','Where is …?',['Yes','Yes I am']),
      turn('You are here. See?','你就在这里。看到了吗？','Here?','这里吗？','Here?',['Yes','I see','Here','No']),
      turn('Need help with the map?','需要帮忙看地图吗？','Help me, please.','请帮帮我。','Help me, please.',['Yes please','Please help me','No thanks']),
    ]],
    ['下一次旅行','preference',63010,[
      turn('Do you like islands?','你喜欢岛屿吗？','I like islands.','我喜欢岛屿。','I like …',['Yes','Yes I do','No']),
      turn('Big or small islands?','大岛还是小岛？','I like small islands.','我喜欢小岛。','I like …',['Small','Big','I like big islands']),
      turn('Want a map?','想要地图吗？','A map, please.','请给我一张地图。','… please.',['Yes please','Yes','No thanks']),
    ]],
  ],
};
export function beginnerStories(profile){
    return stories[profile.npcId]?.map(([title,rewardGroup,requiresQuest,turns],i)=>({
        id:`${profile.id}.beginner${i+1}`,title,context:'和营地居民聊三句。这里只练习交流，不会代替主线操作，也不会购买或领取对话中提到的物品。',
        difficulty:'pre-A1',mode:'basic',rewardGroup,requiresQuest,
        ...(profile.npcId===36202&&i===2?{requiresPet:true}:{}),
        authorSource:'scripts/camp_beginner_stories.mjs',opening:turns[0].question,
        turns:turns.map((t,j)=>({...t,id:`${profile.id}.beginner${i+1}.${j+1}`,patternId:'beginner-authored'})),
        ending:pair('Thank you! See you!','谢谢你！再见！'),
    }));
}
