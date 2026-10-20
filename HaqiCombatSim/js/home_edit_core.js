// Preserve the grabbed point with continuous world coordinates at every zoom level.
export function homeFurnitureDragPosition(origin, start, current, scale) {
 return {
  x:origin.x+(current.sx-start.sx)/scale,
  y:origin.y+(current.sy-start.sy)/scale
 };
}

// Fill gaps between pointer events; each grid cell is visited at most once per stroke.
export function homeStrokeCells(from,to){
 let x=Math.floor(from.x),y=Math.floor(from.y);const tx=Math.floor(to.x),ty=Math.floor(to.y),dx=Math.abs(tx-x),dy=-Math.abs(ty-y),sx=x<tx?1:-1,sy=y<ty?1:-1;
 if(Math.max(dx,-dy)>256)return [{x:tx,y:ty}];
 let error=dx+dy;const cells=[];
 for(;;){cells.push({x,y});if(x===tx&&y===ty)break;const twice=error*2;if(twice>=dy){error+=dy;x+=sx;}if(twice<=dx){error+=dx;y+=sy;}}
 return cells;
}
