import {normalizeLearningAnswer} from './learning_language_core.js';
// A written clue is sufficient; practice is optional and never blocks materials.
export const FORGE_LANGUAGES=['en','ja','ko','zh-CN'];
const LESSONS={
 en:{name:'英语',clue:'Bring three herbs to the campfire.',hint:'herb 是草药，flower 是花朵，stone 是石块。配方要的是 herb。',words:['herb','flower','stone']},
 ja:{name:'日语',clue:'薬草を三つ、たき火へ届けてください。',hint:'薬草（やくそう）是草药，花是花朵，石是石块。配方要的是薬草。',words:['薬草','花','石']},
 ko:{name:'韩语',clue:'약초 세 개를 모닥불로 가져오세요.',hint:'약초 是草药，꽃 是花朵，돌 是石块。配方要的是 약초。',words:['약초','꽃','돌']},
 'zh-CN':{name:'汉语',clue:'采三份草药，带到营火旁。',hint:'配方要的是草药，花朵和石块这次不用。选择“草药”即可。',words:['草药','花朵','石块']},
};
const CONTINUATIONS={
 en:{tea:'tea',answers:['tea','teas'],cook:'Let’s make tea.',challenge:'The tea is ready. Let’s go!',report:'Thank you for the tea.'},
 ja:{tea:'お茶',answers:['お茶','茶','おちゃ','ちゃ'],cook:'お茶を作りましょう。',challenge:'お茶の準備ができました。出発しましょう！',report:'お茶をありがとう。'},
 ko:{tea:'차',answers:['차'],cook:'차를 만들어요.',challenge:'차가 준비됐어요. 출발해요!',report:'차 고마워요.'},
 'zh-CN':{tea:'茶',answers:['茶'],cook:'一起煮茶吧。',challenge:'茶准备好了，一起出发！',report:'谢谢你带来的茶。'},
};
export function forgeLanguage(save){return FORGE_LANGUAGES.includes(save.languageLearning?.target)?save.languageLearning.target:'en';}
export function forgeLesson(save){
 const language=forgeLanguage(save),lesson=LESSONS[language];
 const choices=['herb','flower','stone'].map((id,i)=>({id,label:lesson.words[i]}));
 const offset=FORGE_LANGUAGES.indexOf(language)%choices.length;
 return {...lesson,...CONTINUATIONS[language],language,choices:[...choices.slice(offset),...choices.slice(0,offset)]};
}
export function forgeTeaAnswer(language,answer){
 return FORGE_LANGUAGES.includes(language)&&CONTINUATIONS[language].answers.some(text=>normalizeLearningAnswer(text,language)===normalizeLearningAnswer(answer,language));
}
