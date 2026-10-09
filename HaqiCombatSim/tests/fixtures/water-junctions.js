import {paintLargeTerrain} from '../../js/adventure_large_terrain.js';
const map=await (await fetch('/data/adventure/maps/camp.json')).json();
for(const [material,name]of [['water','清水'],['lava','熔岩'],['ice','冰湖'],['dark','幽暗水域']]){
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=380;canvas.setAttribute('aria-label',name+'交汇水岸');
    const section=document.createElement('section'),label=document.createElement('h2');label.textContent=name;section.append(label,canvas);document.getElementById('samples').append(section);
    const layout={...structuredClone(map),w:600,h:380,coast:[[-100,-100],[700,-100],[700,480],[-100,480]],regions:[],mountains:[],farms:[],trees:[],buildings:[],bridges:[],details:[],features:[],paths:[],center:{x:-1000,y:-1000},
        rivers:[{material,width:46,points:[[180,-100],[170,100],[175,270],[130,480]]},{material,width:36,points:[[480,-100],[440,140],[435,190]]}],
        lakes:[{material,x:180,y:190,rx:100,ry:70},{material,x:440,y:220,rx:100,ry:72}]};
    paintLargeTerrain(canvas.getContext('2d'),{layout,w:600,h:380,paths:[],center:layout.center,zone:'water-preview'},undefined,false);
}
