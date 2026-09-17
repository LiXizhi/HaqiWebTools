import {save,load,download} from '../storage.js';
export const SAVE_KEY=version=>`haqi-game:${version}`;
export async function saveProfile(profile) {
  profile.savedAt=Date.now();
  await save(SAVE_KEY(profile.version),structuredClone(profile));
}
export async function loadProfile(version) {
  const data=await load(SAVE_KEY(version));
  return validateProfile(data)?data:null;
}
export function validateProfile(p) {
  return !!p&&p.schemaVersion===1&&['kids','teen'].includes(p.version)&&typeof p.name==='string'&&['ice','fire','storm','death','life'].includes(p.school)&&['boy','girl'].includes(p.gender)&&Number.isInteger(p.level)&&p.level>=1&&typeof p.inventory==='object'&&Array.isArray(p.deck)&&typeof p.quests==='object';
}
export function exportProfile(profile){download(`haqi-${profile.version}-${profile.name||'player'}.json`,{kind:'haqi-game-profile',...profile});}
export function importProfile(data) {
  if(data?.kind!=='haqi-game-profile')throw new Error('不是哈奇存档文件');
  const {kind,...profile}=data;
  if(!validateProfile(profile))throw new Error('存档格式无效');
  return profile;
}
