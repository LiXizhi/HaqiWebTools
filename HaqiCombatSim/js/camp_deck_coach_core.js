import {learningLanguage} from './learning_language_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {cardSemantics} from './battle_ai/haqi_adapter_core.js';

const text={
    en:{name:'英语',prompt:'Add a trap and a shield to your deck. Save your deck, then try them in the test.',trap:'Trap',shield:'Shield',yes:'ready',no:'missing',ready:'Ready. Save your deck and try these cards in the test.'},
    ja:{name:'日语',prompt:'デッキに罠と盾を入れよう。保存したら、試験で使ってみよう。',trap:'罠',shield:'盾',yes:'あり',no:'なし',ready:'準備できた。保存して、試験で使ってみよう。'},
    ko:{name:'韩语',prompt:'덱에 함정과 방패를 넣어 보세요. 저장한 다음 시험에서 사용해 보세요.',trap:'함정',shield:'방패',yes:'준비 완료',no:'필요',ready:'준비됐어요. 덱을 저장하고 시험에서 사용해 보세요.'},
    'zh-CN':{name:'中文',prompt:'把陷阱和护盾放进卡包。保存后，在考核中试着用一用。',trap:'陷阱',shield:'护盾',yes:'已放入',no:'未放入',ready:'准备好了。保存卡包，在考核中试用这些卡牌。'}
};

// Optional preparation feedback, never a new quest gate or a mastery receipt.
// The draft only counts selectable cards; equipment cards are not placed in this deck.
export function createCampDeckCoach(save,content,dataset){
    if(![63012,63013].some(id=>save?.quests?.[id]?.accepted&&!save.quests[id].claimed))return null;
    const language=learningLanguage(save),copy=text[language],resolved=resolveParams(dataset,content.balanceParams||defaultParams('kids'));
    const roles=new Map(Object.entries(resolved.cards).map(([key,card])=>{
        const semantics=cardSemantics(card,resolved);
        return [key,{
            trap:semantics.effects.some(effect=>effect.kind==='ward'&&Number(effect.boost_damage)>0&&(!effect.school||effect.school==='all'||effect.school===save.school)),
            shield:semantics.roles.includes('shield')
        }];
    }));
    return {language,name:copy.name,prompt:copy.prompt,evaluate(deck){
        const selected=(Array.isArray(deck)?deck:[]).filter(row=>Number(row.count)>0);
        const trap=selected.some(row=>roles.get(row.key)?.trap),shield=selected.some(row=>roles.get(row.key)?.shield);
        return {trap,shield,ready:trap&&shield,feedback:trap&&shield?copy.ready:`${copy.trap}: ${trap?copy.yes:copy.no} · ${copy.shield}: ${shield?copy.yes:copy.no}`};
    }};
}
