// Stable object ids are independent of the language being practiced.
const LESSONS={
 en:{name:'英语',words:{boots:'boots',hat:'hat',note:'note',tent:'tent'},answers:{boots:['boots','boot'],note:['note']},clues:{boots:'Find the boots beside the tent. Leave the hat.',delivery:'Bring the supplies to Sissy.',note:'The note is behind the rock. Move the rock.',briefing:'Keep together. Focus on one enemy.'}},
 ja:{name:'日语',words:{boots:'ブーツ',hat:'帽子',note:'メモ',tent:'テント'},answers:{boots:['ブーツ','ぶーつ'],note:['メモ','めも']},clues:{boots:'テントのそばにあるブーツを探してください。帽子はそのままにしてください。',delivery:'補給品をシシーに届けてください。',note:'メモは岩の後ろにあります。岩を動かしてください。',briefing:'一緒に行動しましょう。一体の敵を集中して攻撃しましょう。'}},
 ko:{name:'韩语',words:{boots:'부츠',hat:'모자',note:'메모',tent:'텐트'},answers:{boots:['부츠'],note:['메모','쪽지']},clues:{boots:'텐트 옆에 있는 부츠를 찾으세요. 모자는 그대로 두세요.',delivery:'보급품을 시시에게 가져다주세요.',note:'메모는 바위 뒤에 있어요. 바위를 옮기세요.',briefing:'함께 행동하세요. 한 적을 집중해서 공격하세요.'}},
 'zh-CN':{name:'中文',words:{boots:'靴子',hat:'帽子',note:'便签',tent:'帐篷'},answers:{boots:['靴子','靴'],note:['便签','便條','便条']},clues:{boots:'找到帐篷旁的靴子。把帽子留在原处。',delivery:'把补给带给茜茜。',note:'便签在石头后面。挪开石头。',briefing:'一起行动，集中攻击同一个敌人。'}}
};
export const FOREST_LEARNING_LANGUAGES=Object.freeze(Object.keys(LESSONS));
export function forestCommissionLanguage(save){const language=save.languageLearning?.target;return Object.hasOwn(LESSONS,language)?language:'en';}
export function forestCommissionLesson(save){const language=forestCommissionLanguage(save);return {language,...LESSONS[language]};}
export function forestLabelWritten(save,word){const language=forestCommissionLanguage(save);return (language==='en'?save.forestCommission?.labels:save.forestCommission?.localizedLabels?.[language])?.includes(word)||false;}
export function forestLabelMatches(save,word,text){const value=String(text||'').normalize('NFKC').trim().toLowerCase();return forestCommissionLesson(save).answers[word]?.includes(value)||false;}
export function forestPracticeId(word,language='en',label=false){return `forest:camp-patrol-supplies:${label?'label-':''}${word}${language==='en'?'':':'+language}:1`;}
export function forestPracticeLanguage(event){return event.language===undefined?'en':event.language;}
