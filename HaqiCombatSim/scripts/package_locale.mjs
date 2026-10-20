// Each language file stays its own asset. Source notes are not shipped.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stripLocaleComments } from '../js/locale_core.js';

export function localePackageFiles(directory) {
    return readdirSync(directory)
        .filter(name => /^[A-Za-z0-9._-]+\.txt$/.test(name))
        .sort()
        .map(name => ({
            fileName: `data/adventure/locale/${name}`,
            // WordNet licenses must accompany adapted vocabulary, including release assets.
            source: name.startsWith('word_')||name==='word-LICENSE.txt'?readFileSync(path.join(directory,name),'utf8'):stripLocaleComments(readFileSync(path.join(directory, name), 'utf8')),
        }));
}
