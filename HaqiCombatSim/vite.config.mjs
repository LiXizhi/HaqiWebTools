import {prepareOfficialCatalog} from './scripts/package_official_website.mjs';
import {prepareMonsterArt} from './scripts/package_monster_art.mjs';
import {prepareQuestJournal} from './scripts/package_quests.mjs';
import { packageRuntimeData } from './scripts/package_runtime_data.mjs';
import { prepareDungeonFiles } from './scripts/package_dungeons.mjs';
import { localePackageFiles } from './scripts/package_locale.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const entries = ['Haqi', 'HaqiCombatSim', 'HaqiCards', 'HaqiEffects', 'HaqiOfficialWebsite', 'HaqiPromo', 'HaqiPromoStage'];

export default defineConfig(({ command }) => {
    // H5 publishes dist/ with CDN art URLs. Store shells use app-dist/ and bake local mode.
    const appTarget = process.env.HAQI_TARGET === 'app';
    const outDir = appTarget ? 'app-dist' : 'dist';
    let dungeonPayload, officialPayload;
    return {
        root,
        base: './',
        publicDir: false,
        define: {
            __HAQI_PACKED_DATA__: JSON.stringify(command === 'build'),
            __HAQI_ASSET_MODE__: JSON.stringify(appTarget ? 'local' : ''),
        },
        plugins: [{
            name: 'inline-cdn-worker',
            apply: 'build',
            enforce: 'pre',
            transform(code, id) {
                const workers = [
                    ['js/sim_pool.js', './sim_worker.js', "new Worker(new URL('./sim_worker.js', import.meta.url), { type: 'module' })"],
                    ['js/battle_ai/client.js', './worker.js', "new Worker(new URL('./worker.js',import.meta.url),{type:'module'})"],
                ];
                const normalizeId = value => process.platform === 'win32'
                    ? value.replaceAll('\\', '/').toLowerCase()
                    : value.replaceAll('\\', '/');
                const worker = workers.find(([file]) => normalizeId(id) === normalizeId(path.join(root, file)));
                if (!worker) return null;
                const [, workerPath, constructor] = worker;
                if (!code.includes(constructor)) this.error(`Inline Worker constructor not found in ${id}`);
                // A release HTML may be hosted on Keepwork while its JS lives on CDN.
                // Vite's inline worker uses a Blob, avoiding cross-origin Worker URLs.
                return {
                    code: `import InlineCdnWorker from '${workerPath}?worker&inline';\n` + code.replace(
                        constructor,
                        'new InlineCdnWorker()',
                    ),
                    map: null,
                };
            },
        }, {
            name: 'copy-runtime-data',
            buildStart() {
                // Refresh the lightweight catalogue for both development and builds.
                dungeonPayload = prepareDungeonFiles(root).payload;
                officialPayload = prepareOfficialCatalog();
                prepareQuestJournal(root);
                prepareMonsterArt(root);
            },
            generateBundle() {
                this.emitFile({type:'asset',fileName:'data/promo/film.json',source:fs.readFileSync(path.join(root,'data/promo/film.json'),'utf8')});
                this.emitFile({type: 'asset', fileName: 'data/official-website.json', source: officialPayload});
                this.emitFile({
                    type: 'asset',
                    fileName: 'data/adventure/dungeons.json',
                    source: JSON.stringify(dungeonPayload),
                });
                for (const file of localePackageFiles(path.join(root, 'data/adventure/locale'))) {
                    this.emitFile({ type: 'asset', fileName: file.fileName, source: file.source });
                }
            },
            closeBundle() {
                if (command !== 'build') return;
                // Artwork is not emitted here. H5 keeps CDN URLs in dist/; the app
                // build copies local WebP/audio afterwards into app-dist/.
                packageRuntimeData(path.join(root, 'data'), path.join(root, outDir, 'data'));
            },
        }],
        build: {
            outDir,
            emptyOutDir: true,
            target: 'es2022',
            modulePreload: { polyfill: false },
            rollupOptions: {
                input: Object.fromEntries(entries.map(name => [name, path.join(root, `${name}.html`)])),
            },
        },
    };
});
