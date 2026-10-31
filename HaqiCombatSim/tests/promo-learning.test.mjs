import test from 'node:test';
import assert from 'node:assert/strict';
import {awardPromoLearning,promoAnswer} from '../js/promo_learning.js';
import {dailyBuffs} from '../js/language_daily_buff_core.js';

test('宣传片只为真实评价确认且原句包含的英文证据授予加成，不重复发放',()=>{
 const save={seed:530},content={};
 for(const learning of [{worthy:false,quote:promoAnswer.en},{worthy:true,quote:'invented evidence'},{worthy:true,quote:''},{worthy:true,quote:'海边'}])assert.equal(awardPromoLearning(save,content,{learning}),null);
 assert.equal(save.dailyLanguageBuff,undefined);
 const response={learning:{worthy:true,quote:'go to the beach'}};
 const reward=awardPromoLearning(save,content,response);assert.equal(reward.total,1);
 assert.equal(Object.values(dailyBuffs(save)).reduce((a,b)=>a+b,0),1);
 assert.equal(awardPromoLearning(save,content,response),null);
});


test('汉语演示只认可当前中文原句证据，中英奖励不混用',()=>{
 const save={seed:530},content={};
 assert.equal(awardPromoLearning(save,content,{learning:{worthy:true,quote:'go to the beach'}},'zh-CN'),null);
 assert.equal(awardPromoLearning(save,content,{learning:{worthy:true,quote:'我想去海边'}},'en'),null);
 const response={learning:{worthy:true,quote:'我想去海边'}};
 assert.equal(awardPromoLearning(save,content,response,'zh-CN').total,1);
 assert.equal(awardPromoLearning(save,content,response,'zh-CN'),null);
});
