import { debugFields, debugLevelForXp, prepareDebugEdit } from './adventure_debug_core.js';
import { equipmentSummary } from './adventure_equipment_core.js';

export function renderDebugEditor(body,{save,assets,debugBackup},cb,{el,button}) {
    const content=assets.content,fields=debugFields(save,content),patch={},inputs=new Map();
    body.append(el('p','debug-intro','调试修改会保存到当前旅程。等级与经验联动；修改前自动保留一份备份，可恢复上一次修改前的状态。战斗中不可修改。'));
    const form=el('form','debug-form'),toolbar=el('div','debug-toolbar');
    const search=el('input');search.type='search';search.placeholder='搜索名称或物品编号';search.setAttribute('aria-label','搜索调试属性');
    const group=el('select');group.setAttribute('aria-label','属性分类');
    for(const name of ['全部',...new Set(fields.map(f=>f.group))]){const option=el('option','',name);option.value=name;group.append(option);}
    toolbar.append(search,group);form.append(toolbar);
    const list=el('div','debug-fields'),empty=el('p','muted','没有匹配的属性。');empty.hidden=true;
    for(const field of fields){
        const input=el('input');input.type='number';input.step='1';input.min=String(field.min);input.max=String(field.max);input.value=field.value;
        input.setAttribute('aria-label',field.label);input.dataset.debugField=field.id;inputs.set(field.id,input);
        const row=el('label','debug-field',el('span','',el('strong','',field.label),el('small','muted',`${field.group} · 当前 ${field.value}`)),input);
        row.dataset.group=field.group;row.dataset.search=`${field.label} ${field.id}`.toLowerCase();
        input.oninput=()=>{
            const value=input.value===''?NaN:Number(input.value);
            if(value===field.value)delete patch[field.id];else patch[field.id]=value;
            if(field.id==='level'&&Number.isInteger(value)&&value>=1&&value<=content.progression.levelCap){
                delete patch.xp;inputs.get('xp').value=content.progression.xpThresholds[value-1];
            }else if(field.id==='xp'&&Number.isSafeInteger(value)&&value>=0){
                delete patch.level;inputs.get('level').value=debugLevelForXp(value,content);
            }
            paintPreview();
        };list.append(row);
    }
    const filter=()=>{let count=0;for(const row of list.children){row.hidden=!(group.value==='全部'||row.dataset.group===group.value)||!row.dataset.search.includes(search.value.trim().toLowerCase());if(!row.hidden)count++;}empty.hidden=count>0;};
    search.oninput=filter;group.onchange=filter;
    const error=el('p','error-text');error.setAttribute('role','alert');
    const preview=el('div','debug-preview');preview.setAttribute('aria-live','polite');
    const submit=button('保存并生效',()=>{},'primary');submit.type='submit';
    const reset=button('撤销未保存修改',()=>{for(const key of Object.keys(patch))delete patch[key];for(const field of fields)inputs.get(field.id).value=field.value;paintPreview();},'secondary');
    const restore=button('恢复上次修改前',()=>cb.restoreDebug(),'secondary');restore.disabled=!debugBackup||!!save.pendingEncounter;
    const result=el('div','debug-result');
    for(const row of equipmentSummary(save,content))result.append(el('span','',`${row.label} ${row.value}${row.unit}`));
    const derived=el('details','debug-derived',el('summary','','查看计算属性（只读）'),result,el('p','muted','生命、攻击、防御等由等级、装备与强化计算。可通过上方对应字段调整；这里不覆盖战斗公式。'));
    form.append(list,empty,el('p','muted','物品数量设为 0 会移除持有；强化需要持有法杖。已学卡牌至少保留 1 份，升级会按原规则学习法术，降级保留已学卡牌。'),error,preview,el('div','debug-actions',submit,reset,restore),derived);
    body.append(form);
    function paintPreview(){
        error.textContent='';preview.replaceChildren();submit.disabled=true;
        try{
            const result=prepareDebugEdit(save,content,patch);
            if(!result.changes.length){preview.append(el('p','muted','尚未修改属性。'));return;}
            preview.append(el('strong','',`将修改 ${result.changes.length} 项`));
            for(const field of result.changes)preview.append(el('p','',`${field.label}：${field.before} → ${field.value}`));
            for(const note of result.notes)preview.append(el('p','debug-note',note));
            submit.disabled=false;
        }catch(e){error.textContent=e.message;}
    }
    form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;try{const result=prepareDebugEdit(save,content,patch);if(result.changes.length)cb.applyDebug({...patch});}catch(e){error.textContent=e.message;}};
    paintPreview();
}
