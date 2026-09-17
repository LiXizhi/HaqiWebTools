import fs from 'node:fs/promises';
import { installExpansion } from '../js/adventure_expansion_core.js';
const read=async path=>JSON.parse(await fs.readFile('data/'+path,'utf8'));
const inputs=await Promise.all(['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json','kids/card_names.json'].map(read));
const {content,dataset}=installExpansion(...inputs);
await fs.writeFile('data/adventure/expansion-report.json',JSON.stringify({pets:Object.keys(inputs[2].pets).length,gear:content.shop.filter(x=>x.kind==='gear').length,cards:Object.keys(dataset.cards).length,excludedEquipment:content.equipmentExportReport,progression:content.progression},null,2)+'\n');
console.log('Expansion report exported');
