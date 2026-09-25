import { isOcean } from './adventure_fishing_core.js';
import { walkable, distance } from './adventure_world_core.js';

// Interaction geometry only: rewards and stamina remain in adventure_fishing_core.
export function fishingSpot(world, hero, requested) {
    if (!isOcean(world, requested.x, requested.y)) return null;
    const heading = Math.atan2(requested.y - hero.y, requested.x - hero.x);
    function waterFrom(shore) {
        for (const offset of [0, -.3, .3, -.6, .6, -1, 1]) {
            for (const length of [115, 145, 175]) {
                const point = { x:shore.x+Math.cos(heading+offset)*length, y:shore.y+Math.sin(heading+offset)*length };
                if (isOcean(world,point.x,point.y)) return point;
            }
        }
        return null;
    }
    const nearby = waterFrom(hero);
    if (nearby) return { shore:{...hero}, water:nearby };
    // Find the first reachable bank in the clicked direction, rather than casting across the island.
    const length = distance(hero,requested);
    let shore = null;
    for (let step=0;step<=Math.min(length,6000);step+=20) {
        const point={x:hero.x+Math.cos(heading)*step,y:hero.y+Math.sin(heading)*step};
        if (walkable(world,point.x,point.y)) shore=point;
        if (isOcean(world,point.x,point.y)) {
            const water=shore&&waterFrom(shore);
            return water ? {shore,water} : null;
        }
    }
    return null;
}
