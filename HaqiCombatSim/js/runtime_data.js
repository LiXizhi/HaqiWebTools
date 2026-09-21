// Browser IO only. Source mode reads individual files; Vite releases read packs.
const productionPacks = typeof __HAQI_PACKED_DATA__ !== 'undefined' && __HAQI_PACKED_DATA__;

export function createJsonReader({ packed = productionPacks, request = (...args) => fetch(...args), onProgress } = {}) {
    const pending = new Map();
    async function download(url) {
        const response = await request(url, packed ? undefined : { cache: 'no-cache' });
        if (!response.ok) throw new Error(`无法读取 ${url}（${response.status}）`);
        if (onProgress) {
            const length = Number(response.headers?.get('content-length'));
            const encoding = response.headers?.get('content-encoding');
            const total = (!encoding || encoding === 'identity') && length > 0 ? length : null;
            let loaded = 0;
            onProgress({ url, loaded, total, done: false });
            if (response.body?.getReader) {
                const reader = response.body.getReader(), decoder = new TextDecoder();
                const chunks = [];
                try {
                    while (true) {
                        const chunk = await reader.read();
                        if (chunk.done) break;
                        loaded += chunk.value.byteLength;
                        chunks.push(decoder.decode(chunk.value, { stream: true }));
                        onProgress({ url, loaded, total, done: false });
                    }
                    chunks.push(decoder.decode());
                    const value = JSON.parse(chunks.join(''));
                    onProgress({ url, loaded, total, done: true });
                    return value;
                } finally {
                    reader.releaseLock();
                }
            }
            const value = await response.json();
            onProgress({ url, loaded, total, done: true });
            return value;
        }
        return response.json();
    }
    return async function readJson(url) {
        if (!packed) return download(url);
        const key = String(url).replace(/^\.\//, '');
        const match = /^data\/(adventure|kids|teen|sample)\/((?:maps\/)?[a-zA-Z0-9_-]+\.json)$/.exec(key);
        if (!match) throw new Error(`未知的数据路径：${url}`);
        const group = match[2] === 'manifest.json' && match[1] !== 'adventure' ? 'datasets' : match[1];
        const packUrl = `data/${group}.json`;
        if (!pending.has(packUrl)) {
            pending.set(packUrl, download(packUrl).then(pack => {
                if (pack?.schemaVersion !== 1 || !pack.files) throw new Error(`数据包格式无效：${packUrl}`);
                return pack;
            }).catch(error => { pending.delete(packUrl); throw error; }));
        }
        const pack = await pending.get(packUrl);
        if (!Object.hasOwn(pack.files, key)) throw new Error(`数据包缺少：${key}`);
        // Dataset normalization / adventure expansion mutate returned objects.
        // Each read must remain isolated, just like a fresh response.json().
        return structuredClone(pack.files[key]);
    };
}

export const fetchJson = createJsonReader();
