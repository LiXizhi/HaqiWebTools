import {createRng,hashSeed} from './rng_core.js';
import {onLargeIsland,segmentDistance} from './adventure_island_layout_core.js';

// Cosmetic floor stamps only. Gathering keeps using groundDecorations unchanged.
// Positions depend on tree coordinates, not tile boundaries or iteration order.
export function* campScenerySteps(world,rect){
    if(world.zone!=='camp'||!world.layout?.rules.terrain.campRefined)return;
    const plaza=world.layout.rules.plaza;
    for(const tree of world.trees){
        if(tree.x<rect.x-160||tree.x>rect.x+rect.w+160||tree.y<rect.y-160||tree.y>rect.y+rect.h+160)continue;
        const rng=createRng(hashSeed(`camp:floor:${tree.x}:${tree.y}`));
        for(let i=0;i<2;i++){
            const size=32+rng.float()*22,x=tree.x+(i?1:-1)*(24+rng.float()*24),y=tree.y+10+rng.float()*24;
            if(!onLargeIsland(world,x,y,55)||world.paths.some(p=>segmentDistance({x,y},p.a,p.b)<p.width/2+size*.55+12))continue;
            if([...world.npcs,...world.encounters,...world.landmarks,world.portal].some(p=>Math.hypot(x-p.x,y-p.y)<100))continue;
            if(((x-world.center.x)/(plaza.radiusX+size))**2+((y-world.center.y)/(plaza.radiusY+size))**2<1)continue;
            if(world.buildings.some(b=>Math.abs(x-b.x)<b.w/2+size&&y>b.y-b.h&&y<b.y+size))continue;
            yield {x,y,size,atlas:'meadow',frame:rng.pick(['clover','moss','fern','daisies','blueFlowers']),flip:rng.int(0,1)===1};
        }
    }
}
