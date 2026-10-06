import {fill} from './locale_runtime.js';
import {languageName} from './character_relationship_core.js';
import {el,button} from './view_adventure.js';
import {drawSchoolIcon} from './card_renderer.js';
import {petPortrait} from './view_adventure_pets.js';
import {selectSocialPetId} from './adventure_companion_core.js';
const schools={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡'};
const paths={mail:'M3 5h18v14H3z M3 6l9 7 9-7',friend:'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M19 8v8 M15 12h8',dungeon:'M5 21V7l7-4 7 4v14 M9 21v-8a3 3 0 0 1 6 0v8 M3 21h18',pvp:'M4 3l8 8-3 3-6-8z M20 3l-8 8 3 3 6-8z M6 15l3 3 M15 18l3-3 M5 20l4-4 M19 20l-4-4',chat:'M3 4h18v13H9l-6 4V4z M7 9h10 M7 13h7'};
function actionIcon(kind){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[kind]);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.6');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;}
function action(label,detail,icon,fn,{disabled=false,primary=false}={}){const b=button('',fn,`profile-action ${primary?'primary':'secondary'}`);b.disabled=disabled;b.setAttribute('aria-label',label);b.append(el('span','profile-action-icon',actionIcon(icon)),el('span','profile-action-copy',el('strong','',label),el('small','',detail)));return b;}
function schoolIcon(school){
    const canvas=el('canvas','partner-school-icon');canvas.width=48;canvas.height=48;canvas.setAttribute('aria-hidden','true');
    const context=canvas.getContext('2d');if(context)drawSchoolIcon(context,school,24,24,36);
    return canvas;
}
function partnerPet(assets,profile){
    if(!assets?.content?.pets)return null;
    const id=selectSocialPetId(profile,assets.content),species=assets.content.pets[id];
    if(!species?.art)return null;
    // Same school-seeded species as the island follower; adult sheet matches resident pets.
    return el('div','partner-pet',petPortrait(assets,id,2,72));
}
export function renderPartnerProfile(body,state,cb){
    const p=state.selected,school=schools[p.school]||'魔法',friend=state.friends.find(f=>f.userId===String(p.userId)),real=p.kind==='account',joined=state.team.some(t=>t.id===p.id),full=!joined&&state.team.length>=3;
    const layout=el('div','partner-profile');layout.dataset.school=p.school;
    const portrait=el('div','partner-portrait',cb.portrait(p));
    const pet=partnerPet(cb.assets?.()||state.assets,p);if(pet)portrait.append(pet);
    const identity=el('aside','partner-identity',portrait,el('h3','partner-name',p.name),el('div','partner-school',schoolIcon(p.school),el('span','',fill(`{v0}系`,{v0:String(school)}).text)));
    const validDate=typeof p.registeredAt==='string'&&Number.isFinite(Date.parse(p.registeredAt));
    identity.append(el('div','partner-foot',el('span','partner-level',fill(`等级 {v0}`,{v0:String(p.level)}).text),el('div','partner-registration',el('span','','注册日期'),el('span','',validDate?p.registeredAt.slice(0,10).replaceAll('-','.'):'暂无资料'))));
    const content=el('div','partner-content',el('div','partner-language',el('span','',fill(`母语 · {v0}`,{v0:String(languageName(p.native))}).text),el('span','',fill(`在学 · {v0}`,{v0:String(languageName(p.target))}).text)),el('p','partner-interest',p.interest||'在旅途中相遇，一起开启新的冒险。'));
    const actions=el('div','partner-actions');
    actions.append(action('直接聊天','聊聊冒险，也练练语言','chat',()=>cb.talk(p),{primary:true}),
        action(joined?'组队出发':'组队下副本',state.coopActive?'正在组队挑战':full?'队伍已满':'一起挑战 PvE 副本','dungeon',()=>cb.teamDungeon(p),{disabled:state.coopActive||full}),
        action('PvP 切磋','红蘑菇赛场 · 1 对 1','pvp',()=>cb.challenge(p),{disabled:state.coopActive||state.busy}),
        ...(real?[action(friend?'已是好友':'加好友',!real?'此伙伴暂无通信账号':friend?'打开好友列表':'认识彼此，保持联系','friend',()=>friend?cb.friends():state.owner?cb.friend(p):cb.login(),{disabled:state.busy})]:[]),
        action('写信',!real?'此伙伴暂无通信账号':!friend?'成为好友后可写信':state.mailAvailable?'给朋友留一封信':'邮件暂未开放','mail',()=>state.owner?cb.compose(friend):cb.login(),{disabled:!real||!friend}));
    content.append(actions);
    const footer=el('div','partner-footer',el('span','',joined?'已在你的队伍中':fill(`队伍 {v0} / 4 人`,{v0:String(state.team.length+1)}).text),button('管理队伍',()=>cb.open('social-party'),'text-button'));
    if(joined&&!state.coopActive)footer.append(button('移出队伍',()=>cb.team(p,false),'text-button'));
    if(friend)footer.append(button('好友私聊',()=>cb.privateChat(friend),'text-button'));
    footer.append(button('关系详情',()=>cb.details(p),'text-button'));content.append(footer);layout.append(identity,content);body.append(layout);
}
