import {DetailDialog} from './view_detail_dialog.js';
import {equipmentAttributes,equipmentCards,EQUIPMENT_SLOTS} from './adventure_equipment_core.js';
import {equipmentRequirements} from './adventure_item_rules_core.js';
import {SCHOOL_NAMES} from './adventure_core.js';

// Read-only item inspection, usable before acquisition and independent of claims.
export class ItemDetails extends DetailDialog {
    constructor(parent,model,ui){super(parent,{el:ui.el});this.model=model;this.ui=ui;}
    show(item,{trigger,source='',requirements=''}={}){
        if(!item)return;
        const {assets,save}=this.model,{el,spellFace}=this.ui,c=assets.content;
        this.body.replaceChildren();this.footer.replaceChildren();
        const art=el('canvas','item-details-art');art.width=96;art.height=96;
        art.setAttribute('role','img');art.setAttribute('aria-label',item.name);
        if(item.art)assets.draw(art.getContext('2d'),item.art,0,0,96,96);
        this.body.append(el('div','equipment-detail-heading',art,el('div','',el('h3','',item.name),el('p','muted',`拥有 ${save.inventory[item.id]||0} 件`))));
        if(item.slot){
            const required=equipmentRequirements(item),school=Object.keys(c.schools).find(key=>c.schools[key]===required.school);
            this.body.append(el('p','muted',`${EQUIPMENT_SLOTS.find(row=>row.id===item.slot)?.name||'装备'} · 等级 ${required.level} · ${school?SCHOOL_NAMES[school]+'系':'全学系通用'}`));
            // Preview base item stats, not another owned instance's upgrades.
            const preview={...save,equipmentInstances:[],upgrades:{}};
            const attributes=el('div','equipment-attributes');
            for(const row of equipmentAttributes(item,preview,c))attributes.append(el('span','',`${row.label} +${row.value}${row.unit}`));
            this.body.append(attributes);
        }
        if(item.description)this.body.append(el('p','',String(item.description).replace(/[|#]/g,' ')));
        const cards=equipmentCards(item,c),faces=el('div','equipment-cards');
        for(const key of cards){const card=assets.dataset.cards[key];if(card&&spellFace)faces.append(spellFace(assets,card));}
        if(faces.childNodes.length)this.body.append(el('h4','','附加法术 · 装备后可用'),faces);
        if(requirements)this.body.append(el('p','equipment-source',`领取条件：${requirements}`));
        if(source)this.body.append(el('p','equipment-source',`获取途径：${source}`));
        this.open(trigger);
    }
}
