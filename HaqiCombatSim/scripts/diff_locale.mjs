import { readFileSync } from 'node:fs';
import { diffLocaleLines } from '../js/locale_core.js';

const basePath = process.argv[2] || 'data/adventure/locale/en.txt';
const otherPath = process.argv[3];
if (!otherPath) {
    console.error('用法: node scripts/diff_locale.mjs data/adventure/locale/en.txt data/adventure/locale/ja.txt');
    process.exit(1);
}
const diff = diffLocaleLines(readFileSync(basePath, 'utf8'), readFileSync(otherPath, 'utf8'));
console.log(`缺少 ${diff.missing.length} 行`);
for (const key of diff.missing) console.log(`- ${key}`);
console.log(`多出 ${diff.extra.length} 行`);
for (const key of diff.extra) console.log(`+ ${key}`);
process.exit(diff.missing.length || diff.extra.length ? 1 : 0);
