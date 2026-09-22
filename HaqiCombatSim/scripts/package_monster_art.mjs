import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assetUrl} from '../js/adventure_media_core.js';
const normalize=v=>String(v||'').replaceAll('\\','/').toLowerCase();
const fallback={fire:'phoenix_spark_peep',ice:'celadon_dream_bear',storm:'leiting_sonic_eagle',life:'nono_leaf_guardian',death:'anubis_cocoa_pup',balance:'dragon_green'};
const extra=[[/toad/i,'coral_leopard_frog'],[/cactus|pineapple|strawberry|orange|banana|alexander/i,'nono_leaf_guardian'],[/bonfire|doomlords|elvin|medusa|ghost|altarguard/i,'anubis_cocoa_pup'],[/sealion|waren/i,'leviathan_ice_sprout']];
export function prepareMonsterArt(root){
    const read=name=>JSON.parse(fs.readFileSync(path.join(root,`data/adventure/${name}.json`),'utf8'));
    const catalog=read('monster-catalog'),bosses=read('boss-art'),pets=read('pets').pets;
    const entries={},bindings={},models={},bossSources=new Map(),adaptations=[];
    for(const [id,entry] of Object.entries(bosses.entries)){
        assetUrl(entry);if(!(entry.size>0&&entry.size<48000&&entry.width===256&&entry.height===256))throw Error('无效Boss图片 '+id);
        entries[id]={local:entry.local,cdn:entry.cdn,width:entry.width,height:entry.height,size:entry.size,sha256:entry.sha256};
        const binding={kind:'portrait',id};bossSources.set(normalize(entry.source),binding);models[normalize(entry.model)]=binding;
    }
    for(const m of catalog.monsters){
        const source=normalize(m.source),model=normalize(m.model);
        let binding=bossSources.get(source)||models[model];
        if(!binding){
            const exact=m.art.petId;
            const petId=exact||extra.find(([pattern])=>pattern.test(model))?.[1]||fallback[m.attributes.phase]||fallback.balance;
            if(!pets[petId])throw Error('缺少怪物复用宠物 '+petId);
            assetUrl(pets[petId].art);
            binding={kind:'pet',petId};
            if(!exact)adaptations.push({source:m.source,model:m.model,petId,reason:'未匹配模型族的二维宠物外观改编'});
        }
        bindings[source+'|'+model]=binding;
        models[model]??=binding;
    }
    const result={version:1,entries,bindings,models,adaptations};
    fs.writeFileSync(path.join(root,'data/adventure/monster-art.json'),JSON.stringify(result)+'\n');
    return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const art=prepareMonsterArt(fileURLToPath(new URL('../',import.meta.url)));
    console.log(`怪物美术：${Object.keys(art.entries).length}张Boss图，${Object.keys(art.bindings).length}项模板/模型绑定`);
}
