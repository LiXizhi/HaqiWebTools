import {canonicalWord} from './word_lexicon_core.js';
import {homeWordReviewDue,homeComprehensionReviewDue} from './home_review_core.js';

// Recommendation window only, not a learning or mastery threshold.
export const HOME_ISLAND_REVIEW_WINDOW=7*86400000;
export function recommendHomeStories(data,stories,{state,index,now}){
 const lessons=new Map(data.games.map(game=>[game.id,game]));
 return stories.map((row,order)=>{
  const complete=row.info.status==='complete';
  const remaining=row.arc.steps.slice(complete?0:row.info.next).map(step=>lessons.get(step.storyId)).filter(Boolean);
  const words=[...new Set(remaining.flatMap(lesson=>lesson.words||[]).map(word=>canonicalWord(index,word)).filter(Boolean))];
  const recent=complete?[]:words.filter(id=>{const p=state.words?.[id]?.lastPractice;return p?.source==='island-course'&&Number.isFinite(p.at)&&p.at>0&&p.at<=now&&now-p.at<=HOME_ISLAND_REVIEW_WINDOW;}).sort((a,b)=>state.words[b].lastPractice.at-state.words[a].lastPractice.at||a.localeCompare(b));
  const due=words.filter(id=>{
   const word=state.words?.[id],at=word?.lastPractice?.at;
   if(!Number.isFinite(now)||!Number.isFinite(at)||at<0||at>now)return false;
   return remaining.some(lesson=>lesson.words.some(w=>canonicalWord(index,w)===id)&&(lesson.listenAction?homeComprehensionReviewDue(word,'listen',now):['read','listen'].includes(lesson.mode)?homeComprehensionReviewDue(word,lesson.mode,now):homeWordReviewDue(word,now)));
  });
  const ongoing=row.info.next>0&&row.info.status!=='complete';
  const replayReady=complete&&row.info.replay?.status==='ready';
  const playable=row.info.status==='ready'||replayReady;
  return {...row,recommendation:{ongoing,recent,due,playable,at:recent.length?state.words[recent[0]].lastPractice.at:0},order};
 }).sort((a,b)=>Number(b.recommendation.playable)-Number(a.recommendation.playable)
  ||Number(b.recommendation.ongoing)-Number(a.recommendation.ongoing)
  ||Number(!!(a.info.replay||a.info).futureItems?.length)-Number(!!(b.info.replay||b.info).futureItems?.length)
  ||b.recommendation.at-a.recommendation.at
  ||b.recommendation.due.length-a.recommendation.due.length
  ||Number(a.info.status==='complete')-Number(b.info.status==='complete')
  ||a.order-b.order);
}
export function homeStoryRecommendationText(row){
 if(row.info.status==='complete')return row.recommendation.due.length?'可以再玩，复习：'+row.recommendation.due.slice(0,3).join('、'):'';
 if(row.recommendation.ongoing)return '接着上次的故事玩';
 if(row.recommendation.recent.length)return '用岛上学过的词：'+row.recommendation.recent.slice(0,3).join('、');
 if(row.recommendation.due.length)return '和伙伴再用一用：'+row.recommendation.due.slice(0,3).join('、');
 return '';
}
