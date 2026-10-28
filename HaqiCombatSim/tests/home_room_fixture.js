export function roomFixture(x=-2,y=-4){
 const rows=[];
 for(let j=0;j<4;j++)for(let i=0;i<4;i++){
  rows.push({id:`room-floor-${i}-${j}`,itemId:'build-wood-floor',x:x+i,y:y+j});
  if(i===0||j===0||i===3||j===3)rows.push({id:`room-wall-${i}-${j}`,itemId:i===2&&j===3?'build-wood-door':'build-wood-wall',x:x+i,y:y+j,rotation:i===0||i===3?1:0});
 }
 return rows;
}
