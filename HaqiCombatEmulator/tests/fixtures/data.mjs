import fs from 'node:fs';
export const rules=Object.fromEntries(['kids','teen'].map(v=>[v,JSON.parse(fs.readFileSync(new URL(`../../data/${v}/ruleset.json`,import.meta.url)))]));
