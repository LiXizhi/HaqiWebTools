import { fill, setText, tr } from './locale_runtime.js';
import {DetailDialog} from './view_detail_dialog.js';
import {signedAttribute,unsupportedEquipmentStats} from './adventure_equipment_core.js';
import {runeObtainLines,runeStatus} from './adventure_runes_core.js';
import {equipmentAttributes,equipmentCards,EQUIPMENT_SLOTS} from './adventure_equipment_core.js';
import {equipmentRequirements} from './adventure_item_rules_core.js';
import {SCHOOL_NAMES} from './adventure_core.js';

// Read-only item inspection, usable before acquisition and independent of claims.
export class ItemDetails extends DetailDialog {
    constructor(parent,model,ui){super(parent,{el:ui.el});this.model=model;this.ui=ui;}
    show(item,{trigger,source='',requirements='',requirementsLabel='领取条件'}={}){
        this.render(item,{source,requirements,requirementsLabel});
        if(item)this.open(trigger);
    }
    render(item,{source='',requirements='',requirementsLabel='领取条件',instanceGuid,owned=false}={}){
        if(!item)return;
        const {assets,save}=this.model,{el,spellFace}=this.ui,c=assets.content;
        this.body.replaceChildren();this.footer.replaceChildren();
        const art=el('canvas','item-details-art');art.width=96;art.height=96;
        art.setAttribute('role','img');art.setAttribute('aria-label',tr(item.name));
        if(item.art)assets.draw(art.getContext('2d'),item.art,0,0,96,96);
        const ownedLine=el('p','muted');setText(ownedLine,'拥有 {count} 件',{count:save.inventory[item.id]||0});
        this.body.append(el('div','equipment-detail-heading',art,el('div','',el('h3','',item.name),ownedLine)));
        if(item.slot){
            const required=equipmentRequirements(item),school=Object.keys(c.schools).find(key=>c.schools[key]===required.school);
            const meta=el('p','muted');
            const slotName=EQUIPMENT_SLOTS.find(row=>row.id===item.slot)?.name||'装备';
            if(school)setText(meta,'{slot} · 等级 {level} · {school}系',{slot:slotName,level:required.level,school:SCHOOL_NAMES[school]});
            else setText(meta,'{slot} · 等级 {level} · 全学系通用',{slot:slotName,level:required.level});
            this.body.append(meta);
            // Preview base item stats, not another owned instance's upgrades.
            const preview=owned?save:{...save,equipmentInstances:[],upgrades:{}};
            const attributes=el('div','equipment-attributes');
            for(const row of equipmentAttributes(item,preview,c,instanceGuid))attributes.append(attributeSpan(el,row));
            this.body.append(attributes);
            if(unsupportedEquipmentStats(item).length)this.body.append(el('p','equipment-warning','这件装备还有未接入的原版属性，当前预览仅包含已支持部分。'));
        }
        const rune=runeStatus(item,c,assets.dataset);
        if(item.description&&!rune)this.body.append(el('p','',String(item.description).replace(/[|#]/g,' ').replace(/\s+/g,' ').trim()));
        if(rune){
            this.body.append(el('p',rune.available?'muted':'equipment-warning',rune.catch?'抓宠符文 · 对野生宠物施放。血量越低越容易成功，成功或失败都消耗一张':rune.available?'战斗符文 · 成功施法消耗一张，失误不消耗':rune.reason));
            const obtain=runeObtainLines(c,item.id);
            if(obtain.length){const line=el('p','equipment-source');setText(line,'获取途径：{source}',{source:obtain.join('；')});this.body.append(line);}
            if(rune.card&&spellFace)this.body.append(el('div','equipment-cards',spellFace(assets,rune.card)));
        }
        const cards=equipmentCards(item,c),faces=el('div','equipment-cards');
        for(const key of cards){const card=assets.dataset.cards[key];if(card&&spellFace)faces.append(spellFace(assets,card));}
        if(faces.childNodes.length)this.body.append(el('h4','','附加法术 · 装备后可用'),faces);
        if(requirements){const line=el('p','equipment-source');setText(line,'{label}：{text}',{label:requirementsLabel,text:requirements});this.body.append(line);}
        if(source){const line=el('p','equipment-source');setText(line,'获取途径：{source}',{source});this.body.append(line);}
    }
}
function attributeSpan(el,row){
    const span=el('span','');
    const amount=`${signedAttribute(row.value)}${row.unit}`;
    const label=row.name?(row.schoolLabel?fill('{school}{name}',{school:row.schoolLabel,name:row.name}).text:tr(row.name)):tr(row.label);
    span.textContent=`${label} ${amount}`;
    if(span.dataset)span.dataset.zh=`${row.label} ${amount}`;
    return span;
}
