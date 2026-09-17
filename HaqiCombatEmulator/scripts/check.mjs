import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=path.resolve(new URL('..',import.meta.url).pathname);let count=0;
function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','test-results'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())scan(p);else if(/\.(m?js)$/.test(p)){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status)throw new Error(r.stderr);if(/js\/(engine|rules|bots)\//.test(p)&&/\b(document|window|fetch|Date|performance)\b|Math\.random/.test(fs.readFileSync(p,'utf8')))throw new Error(`Impure core: ${p}`);count++;}}}
scan(root);console.log(`Syntax and deterministic core boundary checked: ${count} modules`);
