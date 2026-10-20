import {WALL_AO_RADIUS} from './home_building_ao_core.js';
import {buildingBounds,isEdge} from './home_building_core.js';
// The same painter runs in the live canvas and the background raster worker.
export function buildingVisualBounds(o,item){
 const b=buildingBounds(o,item),height=isEdge(item)?1.25*(o.sizeScale??1):item.building.type==='roof'?1.4:0;
 return {x:b.x*40-2,y:(b.y-height)*40-2,w:Math.max(b.w*40,item.building.type==='door'&&o.doorOpen&&(o.rotation||0)%2?40:0)+4,h:(b.h+height)*40+4};
}
export function drawBuilding(c,item,o,image,connections=[1,1],ao=[]){
 const b=buildingBounds(o,item),x=b.x*40,y=b.y*40,w=b.w*40,h=b.h*40,wall=isEdge(item),height=50*(o.sizeScale??1),crop=item.art?.crop;
 c.save();
 const fill=(dx,dy,dw,dh)=>{c.fillStyle=item.building.style==='wood'?'#b38856':'#858c95';c.fillRect(dx,dy,dw,dh);if(image&&crop&&(image.naturalWidth||image.width)&&image.complete!==false)c.drawImage(image,...crop,dx,dy,dw,dh);};
 if(!wall){fill(x,y-(item.building.type==='roof'?56:0),w,h);if(item.building.type==='floor')drawFloorAO(c,b,ao);}
 else if(o.doorOpen&&item.building.type==='door'){
  // Open leaf at the hinge leaves a visible, walkable opening.
  if((o.rotation||0)%2)fill(x,y-height,40,8);else fill(x,y-height,Math.min(w,7),height+h);
 }else{
  if((o.rotation||0)%2){
   c.save();c.transform(1,0,0,h/height,0,y-height);fill(x,0,w,height*2);c.restore();
  }else fill(x,y-height,w,height+h);
  c.fillStyle=item.building.style==='wood'?'#755637':'#626971';
  if(connections[0]===1)c.fillRect(x,y-height,2,height+h);
  if(connections[1]===1)c.fillRect(x+w-2,y-height,2,height+h);
 }
 c.restore();
 return buildingVisualBounds(o,item);
}

// Baked into the existing ground bitmap; no extra compositing layer or bitmap allocation.
function drawFloorAO(c,floor,walls){
 if(!walls.length)return;
 c.save();c.beginPath();c.rect(floor.x*40,floor.y*40,floor.w*40,floor.h*40);c.clip();
 const radius=WALL_AO_RADIUS*40;
 for(const wall of walls){const x=wall.x*40,y=wall.y*40,w=wall.w*40,h=wall.h*40;
  const band=(ax,ay,bx,by,rx,ry,rw,rh)=>{const gradient=c.createLinearGradient(ax,ay,bx,by);gradient.addColorStop(0,'rgba(38,27,19,0.30)');gradient.addColorStop(.35,'rgba(38,27,19,0.13)');gradient.addColorStop(1,'rgba(38,27,19,0)');c.fillStyle=gradient;c.fillRect(rx,ry,rw,rh);};
  if(wall.vertical){band(x,y,x-radius,y,x-radius,y,radius,h);band(x+w,y,x+w+radius,y,x+w,y,radius,h);}
  else{band(x,y,x,y-radius,x,y-radius,w,radius);band(x,y+h,x,y+h+radius,x,y+h,w,radius);}
  c.fillStyle='rgba(38,27,19,0.30)';c.fillRect(x,y,w,h);
 }
 c.restore();
}
