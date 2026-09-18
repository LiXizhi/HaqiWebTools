// Read-only comparison of committed kids definitions, adventure roster and VFX configuration.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
import { validateSpellEffects } from '../js/spell_effects_core.js';
const config=read('data/adventure/spell-effects.json');
const kids=read('data/kids/cards.json'),chapter=read('data/adventure/combat.json').cards,effects=read('data/adventure/spell-effects.json').cards;
validateSpellEffects(config,kids);
const missing=Object.values(kids).filter(c=>!effects[c.key]).map(c=>({key:c.key,spellName:c.spellName,type:c.type,school:c.spellSchool,source:c.datafile}));
const report={baseEffects:Object.keys(config.bases).length,variantReferences:Object.values(effects).filter(ref=>ref.variant.rank!=='normal'||ref.variant.lowLevel).length,scope:'kids committed card definitions; variants are separate entries, not unique skills',kidsDefinitions:Object.keys(kids).length,kidsSpellNames:new Set(Object.values(kids).map(c=>c.spellName)).size,adventureDefinitions:Object.keys(chapter).length,adventureMissing:Object.keys(chapter).filter(key=>!effects[key]),configuredKidsDefinitions:Object.keys(kids).filter(key=>effects[key]).length,missingDefinitions:missing.length,missingByType:missing.reduce((a,c)=>(a[c.type]=(a[c.type]||0)+1,a),{}),missing};
report.choreography=Object.entries(config.bases).map(([base,effect])=>({base,name:effect.name,source:effect.source,...effect.choreography}));
fs.writeFileSync(new URL('docs/spell-effects-coverage.json',root),JSON.stringify(report,null,2)+'\n');
console.log(`Adventure ${report.adventureDefinitions-report.adventureMissing.length}/${report.adventureDefinitions}; kids definitions ${report.configuredKidsDefinitions}/${report.kidsDefinitions}; missing ${report.missingDefinitions}. Report: ${fileURLToPath(new URL('docs/spell-effects-coverage.json',root))}`);
if(report.adventureMissing.length||report.missingDefinitions)process.exitCode=1;
