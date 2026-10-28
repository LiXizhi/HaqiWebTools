export const HOME_DRAWING_ITEMS=['paper'];
export const HOME_DRAWING_COLORS=['#294734','#d94b46','#387ac2','#efb735','#8b54aa','#e879aa','#ffffff','#222222','#7d7d7d','#8b5e3c'];
export function validHomeDrawing(value){
 if(value===undefined)return true;
 if(!value||value.version!==1||!Array.isArray(value.strokes)||value.strokes.length>32)return false;
 let points=0;
 for(const stroke of value.strokes){
  if(!stroke||!HOME_DRAWING_COLORS.includes(stroke.color)||!Array.isArray(stroke.points)||stroke.points.length<1||stroke.points.length>256)return false;
  points+=stroke.points.length;if(points>1024)return false;
  if(stroke.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isInteger(n)||n<0||n>1000)))return false;
 }
 return true;
}
export function homeDrawingHasMarks(drawing){
 return !!drawing&&validHomeDrawing(drawing)&&drawing.strokes.some(s=>s.points.some(p=>Math.hypot(p[0]-s.points[0][0],p[1]-s.points[0][1])>=15));
}
export function homeDrawingChange(changes,id){
 const row=changes.find(c=>c.id===id&&c.before&&c.after);
 return row&&HOME_DRAWING_ITEMS.includes(row.after.itemId)&&homeDrawingHasMarks(row.after.drawing)&&JSON.stringify(row.before.drawing)!==JSON.stringify(row.after.drawing)?row.after.drawing:null;
}
