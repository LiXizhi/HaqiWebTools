import {recordHomeStory} from './home_story_core.js';
// Scheduling evidence only: these intervals are product defaults, not mastery.
export const HOME_REVIEW_SESSION_GAP=30*60*1000;
export const HOME_REVIEW_INTERVALS=[5*60*1000,86400000,3*86400000,7*86400000,14*86400000];
const modes=new Set(['talk','care','find','arrange','turn','write','count','place','draw','door','walk','stand','run','jump']);
const count=n=>Number.isSafeInteger(n)&&n>=0?n:0;
function touchHomeReviewSession(state,event){
 if(Number.isFinite(state.homeReviewSession?.at)&&event.at<state.homeReviewSession.at)return null;
 if(!homeReviewSessionActive(state,event.at))state.homeReviewSession={id:event.id,startedAt:event.at,at:event.at,introduced:0};
 const session=state.homeReviewSession;session.at=event.at;
 if(String(event.source||'').startsWith('home-story:')){const source=String(event.source).slice(0,120);session.stories=[...(Array.isArray(session.stories)?session.stories:[]).filter(s=>s!==source),source].slice(-64);}
 return session;
}
export function homeComprehensionReviewDue(word,input,now){
 const review=word?.comprehension?.[input]?.review;
 if(word?.selfMark==='unknown'&&word.markAt>(review?.lastAt||0))return true;
 return !Number.isFinite(review?.nextAt)||review.nextAt<=now;
}
// Called only after comprehension validation and receipt de-duplication.
// Each skill owns its interval; a read fallback must never postpone listening.
export function recordHomeComprehensionReview(state,event,ids){
 if(!['read','listen'].includes(event.review?.mode)||!['read','listen'].includes(event.input))return;
 const session=touchHomeReviewSession(state,event);if(!session)return;
 for(const id of ids){
  const word=state.words[id],evidence=word?.comprehension?.[event.input];if(!evidence)continue;
  const review=evidence.review??={version:1,stage:0,visits:0};
  if(Number.isFinite(review.lastAt)&&event.at<review.lastAt)continue;
  const newVisit=review.sessionId!==session.id,reset=word.selfMark==='unknown'&&word.markAt>(review.lastAt||0);
  if(newVisit)review.visits=count(review.visits)+1;
  review.stage=Math.min(HOME_REVIEW_INTERVALS.length-1,count(review.stage));
  if(reset||!Number.isFinite(review.nextAt)){review.stage=0;review.nextAt=event.at+HOME_REVIEW_INTERVALS[0];}
  else if(event.assisted||event.attempts>1){review.stage=0;review.nextAt=review.nextAt>event.at?Math.min(review.nextAt,event.at+HOME_REVIEW_INTERVALS[0]):event.at+HOME_REVIEW_INTERVALS[0];}
  else if(newVisit&&event.at>=review.nextAt){review.stage=Math.min(review.stage+1,HOME_REVIEW_INTERVALS.length-1);review.nextAt=event.at+HOME_REVIEW_INTERVALS[review.stage];}
  else if(event.at>=review.nextAt)review.nextAt=event.at+HOME_REVIEW_INTERVALS[0];
  review.sessionId=session.id;review.lastAt=event.at;
 }
}
export function homeReviewSupport(event){
 if(event.review?.evidenceVersion!==1||typeof event.assisted!=='boolean'||!Number.isSafeInteger(event.attempts)||event.attempts<1)return 'unknown';
 return event.assisted?'assisted':event.attempts>1?'retried':'unassisted';
}
export function homeReviewSessionActive(state,now){
 const session=state.homeReviewSession;
 return !!session&&Number.isFinite(session.at)&&Number.isFinite(now)&&now-session.at<HOME_REVIEW_SESSION_GAP;
}
export function homeNewWordBudget(state,now,limit=3){
 return Math.max(0,limit-(homeReviewSessionActive(state,now)?count(state.homeReviewSession.introduced):0));
}
export function homeWordReviewDue(word,now){
 if(word?.selfMark==='unknown'&&word.markAt>(word.homeReview?.lastAt||0))return true;
 return !Number.isFinite(word?.homeReview?.nextAt)||word.homeReview.nextAt<=now;
}
export function recordHomeReview(state,event,ids){
 if(!modes.has(event.review?.mode)||!Number.isFinite(event.at)||event.at<0)return;
 recordHomeStory(state,event);
 // A backwards clock must not manufacture a second visit or move review dates.
 if(Number.isFinite(state.homeReviewSession?.at)&&event.at<state.homeReviewSession.at){
  for(const id of ids)if(state.words[id]&&!Number.isFinite(state.words[id].lastPractice?.at))state.homeReviewSession.introduced=count(state.homeReviewSession.introduced)+1;
  return;
 }
 const session=touchHomeReviewSession(state,event);
 for(const id of ids){
  const word=state.words[id];if(!word)continue;
  if(!Number.isFinite(word.lastPractice?.at))session.introduced=count(session.introduced)+1;
  const old=word.homeReview,reset=word.selfMark==='unknown'&&word.markAt>(old?.lastAt||0);
  const review=word.homeReview=old&&typeof old==='object'?old:{version:1,visits:0,stage:0,modes:{},inputs:{},contexts:[]};
  const newVisit=review.sessionId!==session.id;
  if(newVisit)review.visits=count(review.visits)+1;
  review.stage=Math.min(HOME_REVIEW_INTERVALS.length-1,count(review.stage));
  const support=homeReviewSupport(event);
  if(reset||!Number.isFinite(review.nextAt)){review.stage=0;review.nextAt=event.at+HOME_REVIEW_INTERVALS[0];}
  else if(['assisted','retried'].includes(support)){review.stage=0;review.nextAt=review.nextAt>event.at?Math.min(review.nextAt,event.at+HOME_REVIEW_INTERVALS[0]):event.at+HOME_REVIEW_INTERVALS[0];}
  else if(support==='unassisted'&&newVisit&&event.at>=review.nextAt){review.stage=Math.min(review.stage+1,HOME_REVIEW_INTERVALS.length-1);review.nextAt=event.at+HOME_REVIEW_INTERVALS[review.stage];}
  else if(event.at>=review.nextAt&&support==='unknown')review.nextAt=event.at+HOME_REVIEW_INTERVALS[0];
  else if(!newVisit&&event.at>=review.nextAt)review.nextAt=event.at+HOME_REVIEW_INTERVALS[0];
  review.sessionId=session.id;review.lastAt=event.at;
  review.modes??={};review.inputs??={};
  review.modes[event.review.mode]=count(review.modes[event.review.mode])+1;
  review.inputs[event.input]=count(review.inputs[event.input])+1;
  const source=String(event.source||'home-game').slice(0,120);
  review.contexts=[source,...(Array.isArray(review.contexts)?review.contexts:[]).filter(s=>s!==source)].slice(0,12);
  review.support=support;
  // These are observed UI conditions, not a mastery or level certificate.
  review.supportCounts??={};review.supportCounts[support]=count(review.supportCounts[support])+1;
  review.lastEvidence={id:event.id,at:event.at,input:event.input,support,attempts:support==='unknown'?null:event.attempts};
  if(support==='unassisted'&&review.unassistedSessionId!==session.id){review.unassistedVisits=count(review.unassistedVisits)+1;review.unassistedSessionId=session.id;}
 }
}
