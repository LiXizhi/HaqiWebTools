import { packageRuntimeData } from './scripts/package_runtime_data.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const entries = ['Haqi', 'HaqiCombatSim', 'HaqiCards', 'HaqiEffects'];

export default defineConfig(({ command }) => ({
    root,
    base: './',
    publicDir: false,
    define: { __HAQI_PACKED_DATA__: JSON.stringify(command === 'build') },
    plugins: [{
        name: 'inline-cdn-worker',
        apply: 'build',
        enforce: 'pre',
        transform(code, id) {
            if (id !== path.join(root, 'js/sim_pool.js').replaceAll('\\', '/')) return null;
            // A release HTML may be hosted on Keepwork while its JS lives on CDN.
            // Vite's inline worker uses a Blob, avoiding cross-origin Worker URLs.
            return {
                code: "import InlineSimWorker from './sim_worker.js?worker&inline';\n" + code.replace(
                    "new Worker(new URL('./sim_worker.js', import.meta.url), { type: 'module' })",
                    'new InlineSimWorker()',
                ),
                map: null,
            };
        },
    }, {
        name: 'copy-runtime-data',
        closeBundle() {
            // Artwork already lives on permanent CDN URLs. Only runtime JSON
            // needs document-relative copies; never include artwork in dist.
            packageRuntimeData(path.join(root, 'data'), path.join(root, 'dist', 'data'));
        },
    }],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2022',
        modulePreload: { polyfill: false },
        rollupOptions: {
            input: Object.fromEntries(entries.map(name => [name, path.join(root, `${name}.html`)])),
        },
    },
}));
