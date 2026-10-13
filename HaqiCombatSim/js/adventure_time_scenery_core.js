// Fixed stage dressing, not a reconstruction of any city's historical streets.
// Positions scale with station spacing; only current and adjacent stations exist.
import {visibleTimeStations} from './adventure_time_scroll_core.js';

const themes=[
    ['living:stone-bench','living:baskets','living:fern-pot'],
    ['living:wood-bench','living:handcart','living:shrub-pot'],
    ['living:wood-bench','living:newspaper-rack','living:home-pots'],
    ['living:wood-bench','living:direction-sign','living:flowerbed'],
];
export function timeScenery(data,x){
    return visibleTimeStations(data,x).flatMap(station=>{
        const theme=themes[station.index%themes.length];
        return [
            ['living:shade-pit',-.42,-28,155,210,'back'],
            ['living:flowerbed',-.23,-22,90,48,'back'],
            [theme[0],.12,-18,86,62,'back'],
            [theme[1],.43,-22,70,94,'back'],
            [theme[2],.31,86,62,48,'front'],
            ['living:grass-planter',-.27,90,72,40,'front'],
        ].map(([art,dx,dy,w,h,layer])=>({art,x:station.x+dx*data.spacing,dy,w,h,layer,station:station.index}));
    });
}
