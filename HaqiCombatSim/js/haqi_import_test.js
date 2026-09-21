import { loadKeepwork } from './adventure_cloud.js';
import { readOriginalCharacter } from './haqi_original.js';
import { connectHaqiRest } from './npl_rest.js';

const nodes=Object.fromEntries(['ping','read','cancel','clear','status','result'].map(id=>[id,document.getElementById(id)]));
let active=null;
const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=String(text??'');return node;};
function busy(value) { nodes.ping.disabled=nodes.read.disabled=nodes.clear.disabled=value;nodes.cancel.disabled=!value; }
export function renderSnapshot(root,snapshot) {
    root.replaceChildren(el('h2',`${snapshot.name||'未命名'} · 等级 ${snapshot.level} · ${snapshot.school}`));
    const items=snapshot.inventory.flatMap(bag=>bag.items);
    root.append(el('p',`原服角色号：${snapshot.nid}；背包 ${snapshot.inventory.length} 个；物品记录 ${items.length} 条。以下为原服字段，不代表已完成网页装备或卡组转换。`));
    for(const bag of snapshot.inventory) {
        const details=el('details','');details.append(el('summary',`背包 ${bag.bag}（${bag.items.length} 条）`));
        const scroll=el('div','');scroll.className='scroll';const table=el('table','');
        const header=el('tr','');for(const label of ['实例 GUID','道具 GSID','位置','数量','装备数据','卡包数据'])header.append(el('th',label));table.append(header);
        for(const item of bag.items) {
            const row=el('tr','');
            for(const value of [item.guid,item.gsid,item.position,item.copies,item.serverdata,item.clientdata])row.append(el('td',typeof value==='object'?JSON.stringify(value):value));
            table.append(row);
        }
        scroll.append(table);details.append(scroll);root.append(details);
    }
}
function chooseRole(ids, signal) {
    return new Promise(resolve => {
        const label=el('label','选择原服角色号：'), select=el('select',''), button=el('button','读取所选角色');
        for(const id of ids) {const option=el('option',id);option.value=String(id);select.append(option);}
        label.append(select);nodes.result.replaceChildren(label,button);
        const finish=value=>{signal.removeEventListener('abort',cancelSelection);nodes.result.replaceChildren();resolve(value);};
        const cancelSelection=()=>finish(null);
        signal.addEventListener('abort',cancelSelection,{once:true});
        button.onclick=()=>finish(Number(select.value));
        nodes.status.textContent='此账号有多个原服角色，请选择要读取的角色。';
        if(signal.aborted)cancelSelection();
    });
}
async function run(kind) {
    if(active)return;
    const state={controller:new AbortController(),client:null};active=state;busy(true);nodes.result.replaceChildren();
    const check=()=>{if(active!==state||state.controller.signal.aborted)throw Error('读取已取消。');};
    try {
        if(kind==='ping') {
            nodes.status.textContent='正在连接原服 WebSocket…';
            state.client=await connectHaqiRest();check();
            const response=await state.client.request('Ping');check();
            nodes.status.textContent=`WebSocket 连通，协议版本 ${response.ver}。未进行账号授权。`;
        } else {
            nodes.status.textContent='正在加载 Keepwork 登录…';
            const sdk=await loadKeepwork();check();
            if(!sdk.token)await sdk.showLoginWindow({title:'登录 Keepwork，读取原服角色',lang:'zhCN'});
            check();
            const snapshot=await readOriginalCharacter({sdk,signal:state.controller.signal,selectRole:ids=>chooseRole(ids,state.controller.signal),onProgress:text=>{if(active===state)nodes.status.textContent=text;}});
            check();renderSnapshot(nodes.result,snapshot);nodes.status.textContent='只读拉取完成；未创建角色、未修改冒险存档。';
        }
    } catch(error) { if(active===state)nodes.status.textContent=error.message; }
    finally {state.client?.close();if(active===state){active=null;busy(false);}}
}
function cancel() { const previous=active;active=null;previous?.controller.abort();previous?.client?.close();busy(false);nodes.status.textContent='已取消。未创建角色。'; }
nodes.ping.onclick=()=>run('ping');nodes.read.onclick=()=>run('read');nodes.cancel.onclick=cancel;
nodes.clear.onclick=()=>{nodes.result.replaceChildren();nodes.status.textContent='已清除内存中的显示结果。';};
window.addEventListener('pagehide',cancel);
