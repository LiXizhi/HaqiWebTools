// Preserve the grabbed point while snapping furniture to the existing cell grid.
export function homeFurnitureDragPosition(origin, start, current, scale) {
 return {
  x:origin.x+Math.round((current.sx-start.sx)/scale),
  y:origin.y+Math.round((current.sy-start.sy)/scale)
 };
}
