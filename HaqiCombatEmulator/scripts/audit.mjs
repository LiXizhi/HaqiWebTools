import fs from 'node:fs';import {createHash} from 'node:crypto';import {coverage} from '../js/engine/coverage.js';
const app=new URL('../',import.meta.url),repo=new URL('../../../',import.meta.url);
for(const version of ['kids','teen']){const r=JSON.parse(fs.readFileSync(new URL(`data/${version}/ruleset.json`,app)));let verified=0,absent=0;
 for(const [path,hash] of Object.entries(r.manifest.sources)){const source=new URL(path,repo);if(!fs.existsSync(source)){absent++;continue;}if(createHash('sha256').update(fs.readFileSync(source)).digest('hex')!==hash)throw new Error(`Source changed: ${path}; rerun data:import`);verified++;}
 const c=coverage(r);fs.writeFileSync(new URL(`data/manifests/${version}-coverage.json`,app),JSON.stringify(c,null,2)+'\n');console.log(`${version}: ${verified} source hashes verified; ${absent} local sources unavailable; ${c.supported}/${c.total} executable cards (not full parity), ${c.missing.length} missing references`);
}
