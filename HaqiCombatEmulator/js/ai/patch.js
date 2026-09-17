const allowed=new Set(['damage_min','damage_max','heal_min','heal_max','accuracy','hitchance','pipcost','cooldown','absorb_pts','boost_damage','boost_heal']);
export async function applyPatch(base,patch) {
  if(patch.schemaVersion!==1||patch.baseHash!==base.hash||!Array.isArray(patch.changes)||!patch.changes.length||patch.changes.length>20)throw new Error('数值补丁版本、基线或改动数量无效');
  const next=structuredClone(base),seen=new Set();
  for(const change of patch.changes) {
    const path=change.path;
    if(!Array.isArray(path)||path.some(k=>typeof k!=='string'||['__proto__','prototype','constructor'].includes(k)))throw new Error('非法补丁路径');
    const id=JSON.stringify(path);if(seen.has(id))throw new Error('补丁包含重复字段');seen.add(id);
    const cardPath=path[0]==='cards'&&((path.length===4&&path[2]==='params'&&allowed.has(path[3]))||(path.length===3&&['accuracy','hitchance','pipcost'].includes(path[2])));
    const itemPath=path[0]==='items'&&path.length===4&&path[2]==='stats'&&/^\d+$/.test(path[3]);
    if(!cardPath&&!itemPath)throw new Error('该字段不允许自动调参');
    let object=next;for(const k of path.slice(0,-1)){if(!Object.hasOwn(object,k))throw new Error('补丁路径不存在');object=object[k];}
    const key=path.at(-1),old=object[key],value=change.value;
    if(typeof old!=='number'||old!==change.before||!Number.isFinite(value)||value<0||value>1e7)throw new Error('补丁旧值不匹配或新值无效');
    if(['accuracy','hitchance'].includes(key)&&value>100)throw new Error('概率须为 0–100');
    if(['pipcost','cooldown'].includes(key)&&(!Number.isInteger(value)||value>100))throw new Error('能量与冷却须为整数');
    object[key]=value;
  }
  for(const c of Object.values(next.cards))for(const field of ['damage','heal'])if(typeof c.params[field+'_min']==='number'&&typeof c.params[field+'_max']==='number'&&c.params[field+'_min']>c.params[field+'_max'])throw new Error('区间最小值大于最大值');
  const bytes=new TextEncoder().encode(JSON.stringify({baseHash:base.hash,changes:patch.changes}));
  next.hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  next.parentHash=base.hash;next.patch=structuredClone(patch);
  return next;
}
