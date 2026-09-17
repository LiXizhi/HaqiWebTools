import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { assetUrl } from '../js/adventure_media_core.js';
import { validateMedia } from '../scripts/lib/asset_decode.mjs';
const root=new URL('../',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(`data/${name}.json`,root)));
test('every shop equipment icon has valid crop, archived WebP and permanent CDN provenance',()=>{
    const {content}=installExpansion(...['adventure/chapter','adventure/combat','adventure/pets','adventure/shop-candidates','kids/cards','kids/charms','kids/card_names'].map(read));
    const manifest=read('adventure/shop-icons');
    for(const product of content.shop.filter(row=>row.kind==='gear')){
        const ref=manifest.items[product.itemId];assert.ok(ref,`missing icon ${product.itemId}`);
        const row=manifest.entries[ref.id];assert.ok(row);
        const [x,y,w,h]=ref.crop;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=row.width&&y+h<=row.height);
    }
    for(const row of Object.values(manifest.entries)){
        assetUrl(row,'cdn');const bytes=fs.readFileSync(new URL(assetUrl(row,'local'),root));
        assert.equal(bytes.length,row.size);assert.ok(bytes.length<=200000);
        assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
        assert.deepEqual(validateMedia(row.local,bytes),{width:row.width,height:row.height});
    }
    for(const row of Object.values(manifest.sources)){assert.ok(row.entry.includes(row.md5));assert.match(row.sourceSha256,/^[a-f0-9]{64}$/);}
    for(const row of Object.values(manifest.fallbacks))assert.ok(manifest.sources[row.source]);
});
