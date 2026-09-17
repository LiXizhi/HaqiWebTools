export async function loadRuleset(version='kids') {
  if(!['kids','teen'].includes(version))throw new Error('未知版本');
  const response=await fetch(new URL(`../../data/${version}/ruleset.json`,import.meta.url));
  if(!response.ok)throw new Error(`数据加载失败 (${response.status})`);
  const data=await response.json();
  if(data.schemaVersion!==1||data.version!==version||!data.cards||!data.items)throw new Error('数据包格式不兼容');
  return data;
}
